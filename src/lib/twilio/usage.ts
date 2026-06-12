import twilio from "twilio";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").createServerClient>;

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Missing Twilio credentials");
  return twilio(sid, token);
}

// Categories to pull from Twilio Usage Records API.
// These cover both message charges and carrier surcharges.
const USAGE_CATEGORIES = [
  "sms-outbound",
  "sms-outbound-longcode",
  "sms-carrier-fees",         // Carrier surcharge for SMS
  "mms-outbound",
  "mms-outbound-longcode",
  "mms-carrier-fees",         // Carrier surcharge for MMS
  "carrier-fees",             // Catch-all carrier fees
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Sync Twilio usage records for the given date into the twilio_usage table.
 * Upserts on (usage_date, category) so it is safe to call repeatedly.
 */
export async function syncUsageForDate(
  supabase: SupabaseClient,
  date: Date
): Promise<number> {
  const tw = getClient();
  const dateStr = formatDate(date);

  const records = await tw.usage.records.daily.list({
    startDate: new Date(dateStr),
    endDate: new Date(dateStr),
  });

  let upserted = 0;

  for (const record of records) {
    const category = record.category;
    // Only store the categories we care about
    if (!USAGE_CATEGORIES.includes(category)) continue;

    const count = parseInt(String(record.count), 10) || 0;
    const price = Math.abs(parseFloat(String(record.price)) || 0);

    if (count === 0 && price === 0) continue;

    const { error } = await supabase
      .from("twilio_usage")
      .upsert(
        {
          usage_date: dateStr,
          category,
          count,
          price,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "usage_date,category" }
      );

    if (error) {
      console.error(`[usage] Upsert failed for ${category} on ${dateStr}:`, error.message);
    } else {
      upserted++;
    }
  }

  return upserted;
}

/**
 * Sync today and yesterday's usage. Called from the cron.
 * Yesterday is re-synced because carrier fees can post late.
 */
export async function syncRecentUsage(supabase: SupabaseClient): Promise<number> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const t = await syncUsageForDate(supabase, today);
  const y = await syncUsageForDate(supabase, yesterday);

  const total = t + y;
  if (total > 0) {
    console.log(`[usage] Synced ${total} usage records (today: ${t}, yesterday: ${y})`);
  }

  return total;
}

export interface UsageBreakdown {
  messageCharges: number;
  carrierFees: number;
  totalSpend: number;
}

/**
 * Query spend from twilio_usage table for a date range.
 * Returns message charges and carrier fees separately.
 */
export async function getUsageSpend(
  supabase: SupabaseClient,
  startDate: string | null
): Promise<UsageBreakdown> {
  let query = supabase
    .from("twilio_usage")
    .select("category, price");

  if (startDate) {
    query = query.gte("usage_date", startDate);
  }

  const { data } = await query;

  let messageCharges = 0;
  let carrierFees = 0;

  for (const row of data || []) {
    const price = Number(row.price || 0);
    if (row.category.includes("carrier-fee") || row.category === "carrier-fees") {
      carrierFees += price;
    } else {
      messageCharges += price;
    }
  }

  return {
    messageCharges,
    carrierFees,
    totalSpend: messageCharges + carrierFees,
  };
}
