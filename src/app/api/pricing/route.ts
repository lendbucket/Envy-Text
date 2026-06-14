import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCalibrationState } from "@/lib/sms/calibration";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Fetch manual pricing settings
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "sms_price_per_segment",
        "mms_price",
        "carrier_fee_per_sms",
        "carrier_fee_per_mms",
      ]);

    const pricing: Record<string, number> = {
      sms_price_per_segment: 0.0079,
      mms_price: 0.02,
      carrier_fee_per_sms: 0.003,
      carrier_fee_per_mms: 0.01,
    };

    for (const row of data || []) {
      pricing[row.key] = parseFloat(String(row.value));
    }

    // Fetch calibration state
    const calibration = await getCalibrationState(supabase);

    // Determine effective rates:
    // If pinned → always manual.  If calibrated rate exists → use it.
    const useCalibrated = !calibration.calibration_pinned;
    const hasCalibratedSms = calibration.calibrated_sms_rate !== null;
    const hasCalibratedMms = calibration.calibrated_mms_rate !== null;

    const manualSmsRate = pricing.sms_price_per_segment + pricing.carrier_fee_per_sms;
    const manualMmsRate = pricing.mms_price + pricing.carrier_fee_per_mms;

    // Effective rates used for cost estimation
    const effectiveSmsRate = useCalibrated && hasCalibratedSms
      ? calibration.calibrated_sms_rate!
      : manualSmsRate;
    const effectiveMmsRate = useCalibrated && hasCalibratedMms
      ? calibration.calibrated_mms_rate!
      : manualMmsRate;

    return NextResponse.json({
      // Original manual pricing (still needed for segment-level breakdown)
      ...pricing,
      // Calibration metadata
      calibration: {
        calibrated_sms_rate: calibration.calibrated_sms_rate,
        calibrated_mms_rate: calibration.calibrated_mms_rate,
        sample_size: calibration.calibration_sample_size,
        updated_at: calibration.calibration_updated_at,
        pinned: calibration.calibration_pinned,
        manual_sms_rate: manualSmsRate,
        manual_mms_rate: manualMmsRate,
        effective_sms_rate: effectiveSmsRate,
        effective_mms_rate: effectiveMmsRate,
        sms_source: useCalibrated && hasCalibratedSms ? "calibrated" : "manual",
        mms_source: useCalibrated && hasCalibratedMms ? "calibrated" : "manual",
      },
    });
  } catch {
    return NextResponse.json({
      sms_price_per_segment: 0.0079,
      mms_price: 0.02,
      carrier_fee_per_sms: 0.003,
      carrier_fee_per_mms: 0.01,
      calibration: null,
    });
  }
}
