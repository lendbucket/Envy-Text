import { fetchMessageStatus } from "./client";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").createServerClient>;

const PAGE = 1000;

export interface ReconcileResult {
  checked: number;
  updated: number;
  delivered: number;
  failed: number;
  still_pending: number;
  campaign_counts: {
    actual_sent: number;
    actual_failed: number;
  };
}

/**
 * Reconcile a campaign's recipient statuses against the Twilio API.
 * Fetches every campaign_recipients row stuck in "sent" status with a twilio_sid,
 * queries Twilio for the real status, and syncs status/error/price onto the row
 * and the matching messages row. Then recomputes the campaign aggregate counts.
 */
export async function reconcileCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<ReconcileResult> {
  // Fetch all "sent" rows that have a twilio_sid (paginated)
  const staleRows: { id: string; twilio_sid: string }[] = [];
  let offset = 0;
  let more = true;
  while (more) {
    const { data } = await supabase
      .from("campaign_recipients")
      .select("id, twilio_sid")
      .eq("campaign_id", campaignId)
      .eq("status", "sent")
      .not("twilio_sid", "is", null)
      .range(offset, offset + PAGE - 1);
    if (data && data.length > 0) {
      staleRows.push(...data);
      offset += PAGE;
      if (data.length < PAGE) more = false;
    } else {
      more = false;
    }
  }

  let checked = 0;
  let updated = 0;
  let deliveredCount = 0;
  let failedCount = 0;

  for (const row of staleRows) {
    checked++;
    try {
      const twilio = await fetchMessageStatus(row.twilio_sid);

      // Only update if Twilio reports a terminal status beyond "sent"
      if (twilio.status === "sent") continue;

      const recipientUpdate: Record<string, unknown> = {
        status: twilio.status,
      };
      const messageUpdate: Record<string, unknown> = {
        status: twilio.status,
      };

      if (twilio.status === "failed") {
        recipientUpdate.error_code = twilio.errorCode;
        recipientUpdate.error_message = twilio.errorMessage;
        messageUpdate.error_code = twilio.errorCode;
        messageUpdate.error_message = twilio.errorMessage;
        failedCount++;
      }

      if (twilio.status === "delivered") {
        deliveredCount++;
      }

      if (twilio.price != null) {
        recipientUpdate.actual_price = twilio.price;
        messageUpdate.actual_price = twilio.price;
      }
      if (twilio.segments != null) {
        recipientUpdate.actual_segments = twilio.segments;
        messageUpdate.actual_segments = twilio.segments;
      }

      await supabase
        .from("campaign_recipients")
        .update(recipientUpdate)
        .eq("id", row.id);

      await supabase
        .from("messages")
        .update(messageUpdate)
        .eq("twilio_sid", row.twilio_sid);

      updated++;
    } catch {
      // Skip individual failures, continue with next row
    }
  }

  // Recompute campaign aggregate counts
  const { count: sentCount } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "delivered"]);

  const { count: failCount } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "failed");

  const { count: stillPending } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  const campaignCounts = {
    actual_sent: sentCount || 0,
    actual_failed: failCount || 0,
  };

  await supabase
    .from("campaigns")
    .update(campaignCounts)
    .eq("id", campaignId);

  console.log(
    `[reconcile] Campaign ${campaignId}: checked ${checked}, updated ${updated} (${deliveredCount} delivered, ${failedCount} failed), ${stillPending || 0} still pending`
  );

  return {
    checked,
    updated,
    delivered: deliveredCount,
    failed: failedCount,
    still_pending: stillPending || 0,
    campaign_counts: campaignCounts,
  };
}

/**
 * Reconcile stale "sent" rows across ALL campaigns (for cron use).
 * Processes up to `limit` rows per run.
 */
export async function reconcileStaleRows(
  supabase: SupabaseClient,
  limit: number = 30
): Promise<{ checked: number; updated: number; campaignsRefreshed: Set<string> }> {
  const { data: staleRows } = await supabase
    .from("campaign_recipients")
    .select("id, twilio_sid, campaign_id")
    .eq("status", "sent")
    .not("twilio_sid", "is", null)
    .limit(limit);

  let checked = 0;
  let updated = 0;
  const campaignsToRefresh = new Set<string>();

  for (const row of staleRows || []) {
    checked++;
    try {
      const twilio = await fetchMessageStatus(row.twilio_sid);
      if (twilio.status === "sent") continue;

      const recipientUpdate: Record<string, unknown> = {
        status: twilio.status,
      };
      const messageUpdate: Record<string, unknown> = {
        status: twilio.status,
      };

      if (twilio.status === "failed") {
        recipientUpdate.error_code = twilio.errorCode;
        recipientUpdate.error_message = twilio.errorMessage;
        messageUpdate.error_code = twilio.errorCode;
        messageUpdate.error_message = twilio.errorMessage;
      }

      if (twilio.price != null) {
        recipientUpdate.actual_price = twilio.price;
        messageUpdate.actual_price = twilio.price;
      }
      if (twilio.segments != null) {
        recipientUpdate.actual_segments = twilio.segments;
        messageUpdate.actual_segments = twilio.segments;
      }

      await supabase
        .from("campaign_recipients")
        .update(recipientUpdate)
        .eq("id", row.id);

      await supabase
        .from("messages")
        .update(messageUpdate)
        .eq("twilio_sid", row.twilio_sid);

      updated++;
      campaignsToRefresh.add(row.campaign_id);
    } catch {
      // Skip individual failures
    }
  }

  // Recompute aggregate counts for any affected campaigns
  for (const campaignId of campaignsToRefresh) {
    const { count: sentCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "delivered"]);

    const { count: failCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed");

    await supabase
      .from("campaigns")
      .update({
        actual_sent: sentCount || 0,
        actual_failed: failCount || 0,
      })
      .eq("id", campaignId);
  }

  if (updated > 0) {
    console.log(
      `[cron] Reconciled ${updated}/${checked} stale rows across ${campaignsToRefresh.size} campaign(s)`
    );
  }

  return { checked, updated, campaignsRefreshed: campaignsToRefresh };
}
