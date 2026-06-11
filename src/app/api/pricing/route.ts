import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
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

    return NextResponse.json(pricing);
  } catch {
    return NextResponse.json({
      sms_price_per_segment: 0.0079,
      mms_price: 0.02,
      carrier_fee_per_sms: 0.003,
      carrier_fee_per_mms: 0.01,
    });
  }
}
