import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const EDITABLE_KEYS = [
  "sms_price_per_segment",
  "mms_price",
  "carrier_fee_per_sms",
  "carrier_fee_per_mms",
  "test_phone_number",
  "calibration_pinned",
] as const;

const updateSchema = z.object({
  sms_price_per_segment: z.string().optional(),
  mms_price: z.string().optional(),
  carrier_fee_per_sms: z.string().optional(),
  carrier_fee_per_mms: z.string().optional(),
  test_phone_number: z.string().optional(),
  calibration_pinned: z.string().optional(),
});

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from("settings").select("key, value");

    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const row of data || []) {
      settings[row.key] = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
    }

    // Add read-only env values
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com";
    settings.twilio_phone_number = process.env.TWILIO_PHONE_NUMBER || "";
    settings.webhook_url = `${appUrl}/api/twilio/inbound`;

    return NextResponse.json(settings);
  } catch (err) {
    console.error("Settings GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings data" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    for (const key of EDITABLE_KEYS) {
      const value = parsed.data[key];
      if (value === undefined) continue;

      const { error } = await supabase
        .from("settings")
        .upsert({ key, value: JSON.parse(JSON.stringify(value)) }, { onConflict: "key" });

      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Settings PUT error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
