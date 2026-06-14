import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCalibrationState, getCampaignVarianceTrend } from "@/lib/sms/calibration";

export async function GET() {
  try {
    const supabase = createServerClient();

    const [state, varianceTrend] = await Promise.all([
      getCalibrationState(supabase),
      getCampaignVarianceTrend(supabase, 12),
    ]);

    const smsDriftPct = state.calibrated_sms_rate !== null && state.manual_sms_rate > 0
      ? ((state.calibrated_sms_rate - state.manual_sms_rate) / state.manual_sms_rate) * 100
      : null;
    const mmsDriftPct = state.calibrated_mms_rate !== null && state.manual_mms_rate > 0
      ? ((state.calibrated_mms_rate - state.manual_mms_rate) / state.manual_mms_rate) * 100
      : null;

    return NextResponse.json({
      calibrated_sms_rate: state.calibrated_sms_rate,
      calibrated_mms_rate: state.calibrated_mms_rate,
      sample_size: state.calibration_sample_size,
      updated_at: state.calibration_updated_at,
      pinned: state.calibration_pinned,
      manual_sms_rate: state.manual_sms_rate,
      manual_mms_rate: state.manual_mms_rate,
      sms_drift_pct: smsDriftPct,
      mms_drift_pct: mmsDriftPct,
      variance_trend: varianceTrend,
    });
  } catch (err) {
    console.error("Calibration API error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load calibration data" }, { status: 500 });
  }
}
