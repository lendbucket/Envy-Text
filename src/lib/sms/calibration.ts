/**
 * Cost calibration loop.
 *
 * After every Twilio usage sync the cron calls `recalibrateRates()`.
 * It joins completed-campaign recipient-level actual costs against segment
 * counts to derive observed blended SMS-per-segment and MMS-per-message
 * rates (inclusive of carrier fees).  Recent campaigns are weighted more
 * heavily, anomaly caps prevent a single billing glitch from poisoning the
 * estimate, and a minimum-volume threshold gates whether the calibrated
 * rate is trusted.
 */

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").createServerClient>;

// --- tunables -----------------------------------------------------------

/** Minimum total SMS segments across qualifying campaigns before we trust the calibrated rate. */
const MIN_SMS_SEGMENTS = 200;
/** Minimum total MMS messages across qualifying campaigns before we trust the calibrated rate. */
const MIN_MMS_MESSAGES = 50;
/** Maximum percentage the calibrated rate can swing per update (0-1). */
const MAX_SWING_PCT = 0.25;
/** How many most-recent completed campaigns to consider. */
const TRAILING_CAMPAIGN_LIMIT = 20;

// --- types --------------------------------------------------------------

export interface CalibrationResult {
  smsRate: number | null;      // calibrated blended cost per SMS segment
  mmsRate: number | null;      // calibrated blended cost per MMS message
  sampleSize: number;          // number of campaigns used
  smsSampleSegments: number;   // total SMS segments in sample
  mmsSampleMessages: number;   // total MMS messages in sample
  updatedAt: string;
}

export interface CalibrationState {
  calibrated_sms_rate: number | null;
  calibrated_mms_rate: number | null;
  calibration_sample_size: number;
  calibration_updated_at: string | null;
  calibration_pinned: boolean;
  // manual settings for comparison
  manual_sms_rate: number;   // sms_price_per_segment + carrier_fee_per_sms
  manual_mms_rate: number;   // mms_price + carrier_fee_per_mms
}

// --- helpers ------------------------------------------------------------

async function getSettingNum(supabase: SupabaseClient, key: string, fallback: number): Promise<number> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).single();
  if (!data) return fallback;
  const v = parseFloat(String(data.value));
  return isNaN(v) ? fallback : v;
}

async function getSettingStr(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).single();
  if (!data || data.value === "null" || data.value === null) return null;
  return String(data.value);
}

async function upsertSetting(supabase: SupabaseClient, key: string, value: string): Promise<void> {
  await supabase.from("settings").upsert(
    { key, value: JSON.parse(JSON.stringify(value)) },
    { onConflict: "key" },
  );
}

/** Clamp a new rate so it doesn't swing more than MAX_SWING_PCT from the previous. */
function clampSwing(newRate: number, prevRate: number | null): number {
  if (prevRate === null || prevRate <= 0) return newRate;
  const maxDelta = prevRate * MAX_SWING_PCT;
  if (newRate > prevRate + maxDelta) return prevRate + maxDelta;
  if (newRate < prevRate - maxDelta) return prevRate - maxDelta;
  return newRate;
}

// --- main calibration ---------------------------------------------------

/**
 * Recompute calibrated per-unit rates from completed campaign data.
 *
 * For each completed campaign we sum:
 *   - actual_price across its campaign_recipients (includes carrier fees
 *     baked into per-message Twilio pricing)
 *   - actual_segments for SMS, count of MMS messages
 *
 * We weight recent campaigns more heavily via a linear decay factor:
 *   weight = (TRAILING_CAMPAIGN_LIMIT - rank) / TRAILING_CAMPAIGN_LIMIT
 * where rank=0 is the most recent campaign.
 *
 * The blended rate = weighted_total_cost / weighted_total_units.
 */
export async function recalibrateRates(supabase: SupabaseClient): Promise<CalibrationResult> {
  // Fetch the most recent completed campaigns
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, completed_at, media_urls")
    .eq("status", "sent")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(TRAILING_CAMPAIGN_LIMIT);

  let weightedSmsCost = 0;
  let weightedSmsSegments = 0;
  let weightedMmsCost = 0;
  let weightedMmsMessages = 0;
  let totalSmsSampleSegments = 0;
  let totalMmsSampleMessages = 0;
  let campaignsUsed = 0;

  for (let rank = 0; rank < (campaigns || []).length; rank++) {
    const camp = campaigns![rank];
    const weight = (TRAILING_CAMPAIGN_LIMIT - rank) / TRAILING_CAMPAIGN_LIMIT;
    const isMms = camp.media_urls && camp.media_urls.length > 0;

    // Aggregate actual cost and segments for this campaign's delivered recipients
    const PAGE = 1000;
    let offset = 0;
    let campCost = 0;
    let campSegments = 0;
    let campCount = 0;
    let more = true;

    while (more) {
      const { data: rows } = await supabase
        .from("campaign_recipients")
        .select("actual_price, actual_segments")
        .eq("campaign_id", camp.id)
        .in("status", ["sent", "delivered"])
        .not("actual_price", "is", null)
        .range(offset, offset + PAGE - 1);

      for (const row of rows || []) {
        const price = Number(row.actual_price || 0);
        const segs = Number(row.actual_segments || 1);
        campCost += price;
        campSegments += segs;
        campCount++;
      }

      if (!rows || rows.length < PAGE) more = false;
      else offset += PAGE;
    }

    if (campCount === 0) continue;
    campaignsUsed++;

    if (isMms) {
      weightedMmsCost += campCost * weight;
      weightedMmsMessages += campCount * weight;
      totalMmsSampleMessages += campCount;
    } else {
      weightedSmsCost += campCost * weight;
      weightedSmsSegments += campSegments * weight;
      totalSmsSampleSegments += campSegments;
    }
  }

  // Compute raw observed rates
  const rawSmsRate = weightedSmsSegments > 0 ? weightedSmsCost / weightedSmsSegments : null;
  const rawMmsRate = weightedMmsMessages > 0 ? weightedMmsCost / weightedMmsMessages : null;

  // Load previous calibrated rates for swing clamping
  const prevSms = await getSettingStr(supabase, "calibrated_sms_rate");
  const prevMms = await getSettingStr(supabase, "calibrated_mms_rate");
  const prevSmsRate = prevSms !== null ? parseFloat(prevSms) : null;
  const prevMmsRate = prevMms !== null ? parseFloat(prevMms) : null;

  // Apply volume threshold + swing clamp
  let smsRate: number | null = null;
  if (rawSmsRate !== null && totalSmsSampleSegments >= MIN_SMS_SEGMENTS) {
    smsRate = clampSwing(rawSmsRate, prevSmsRate);
  }

  let mmsRate: number | null = null;
  if (rawMmsRate !== null && totalMmsSampleMessages >= MIN_MMS_MESSAGES) {
    mmsRate = clampSwing(rawMmsRate, prevMmsRate);
  }

  const now = new Date().toISOString();

  // Persist to settings
  await upsertSetting(supabase, "calibrated_sms_rate", smsRate !== null ? smsRate.toFixed(6) : "null");
  await upsertSetting(supabase, "calibrated_mms_rate", mmsRate !== null ? mmsRate.toFixed(6) : "null");
  await upsertSetting(supabase, "calibration_sample_size", String(campaignsUsed));
  await upsertSetting(supabase, "calibration_updated_at", now);

  console.log(
    `[calibration] Recalibrated: SMS=$${smsRate?.toFixed(6) ?? "n/a"} (${totalSmsSampleSegments} segs), ` +
    `MMS=$${mmsRate?.toFixed(6) ?? "n/a"} (${totalMmsSampleMessages} msgs), ${campaignsUsed} campaigns`,
  );

  return {
    smsRate,
    mmsRate,
    sampleSize: campaignsUsed,
    smsSampleSegments: totalSmsSampleSegments,
    mmsSampleMessages: totalMmsSampleMessages,
    updatedAt: now,
  };
}

// --- read current state -------------------------------------------------

export async function getCalibrationState(supabase: SupabaseClient): Promise<CalibrationState> {
  const [
    calibSms, calibMms, sampleSize, updatedAt, pinned,
    smsPrice, carrierSms, mmsPrice, carrierMms,
  ] = await Promise.all([
    getSettingStr(supabase, "calibrated_sms_rate"),
    getSettingStr(supabase, "calibrated_mms_rate"),
    getSettingNum(supabase, "calibration_sample_size", 0),
    getSettingStr(supabase, "calibration_updated_at"),
    getSettingStr(supabase, "calibration_pinned"),
    getSettingNum(supabase, "sms_price_per_segment", 0.0079),
    getSettingNum(supabase, "carrier_fee_per_sms", 0.003),
    getSettingNum(supabase, "mms_price", 0.02),
    getSettingNum(supabase, "carrier_fee_per_mms", 0.01),
  ]);

  return {
    calibrated_sms_rate: calibSms !== null ? parseFloat(calibSms) : null,
    calibrated_mms_rate: calibMms !== null ? parseFloat(calibMms) : null,
    calibration_sample_size: sampleSize,
    calibration_updated_at: updatedAt,
    calibration_pinned: pinned === "true",
    manual_sms_rate: smsPrice + carrierSms,
    manual_mms_rate: mmsPrice + carrierMms,
  };
}

// --- per-campaign variance (for dashboard trend) ------------------------

export interface CampaignVariance {
  campaignId: string;
  campaignName: string;
  completedAt: string;
  estimatedCost: number;
  actualCost: number;
  variance: number;       // estimated - actual
  variancePct: number;    // variance / actual * 100
}

export async function getCampaignVarianceTrend(
  supabase: SupabaseClient,
  limit = 12,
): Promise<CampaignVariance[]> {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, completed_at, estimated_cost")
    .eq("status", "sent")
    .not("completed_at", "is", null)
    .not("estimated_cost", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  const result: CampaignVariance[] = [];

  for (const camp of campaigns || []) {
    // Sum actual cost from campaign_recipients
    const PAGE = 1000;
    let offset = 0;
    let actualCost = 0;
    let more = true;

    while (more) {
      const { data: rows } = await supabase
        .from("campaign_recipients")
        .select("actual_price")
        .eq("campaign_id", camp.id)
        .in("status", ["sent", "delivered"])
        .not("actual_price", "is", null)
        .range(offset, offset + PAGE - 1);

      for (const row of rows || []) {
        actualCost += Number(row.actual_price || 0);
      }

      if (!rows || rows.length < PAGE) more = false;
      else offset += PAGE;
    }

    if (actualCost <= 0) continue;

    const estimated = Number(camp.estimated_cost || 0);
    const variance = estimated - actualCost;
    const variancePct = actualCost > 0 ? (variance / actualCost) * 100 : 0;

    result.push({
      campaignId: camp.id,
      campaignName: camp.name,
      completedAt: camp.completed_at,
      estimatedCost: estimated,
      actualCost,
      variance,
      variancePct,
    });
  }

  return result.reverse(); // chronological order
}
