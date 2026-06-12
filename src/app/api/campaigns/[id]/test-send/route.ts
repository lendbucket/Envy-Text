import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/twilio/client";
import { renderMergeFields } from "@/lib/sms/merge";
import { applyOptOutSuffix } from "@/lib/sms/compliance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("body, media_urls, append_opt_out")
      .eq("id", id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get test phone number from settings
    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "test_phone_number")
      .single();

    const testPhone = setting?.value ? String(setting.value).replace(/"/g, "") : "";
    if (!testPhone) {
      return NextResponse.json(
        { error: "Set a test phone number in Settings first." },
        { status: 400 }
      );
    }

    // Render with sample merge fields
    let body = renderMergeFields(campaign.body, {
      first_name: "Test",
      last_name: "User",
    });
    body = applyOptOutSuffix(body, campaign.append_opt_out !== false);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com").replace(/\/$/, "");

    await sendMessage({
      to: testPhone,
      body,
      mediaUrls: campaign.media_urls?.length > 0 ? campaign.media_urls : undefined,
      statusCallback: `${appUrl}/api/twilio/status`,
    });

    return NextResponse.json({ ok: true, sent_to: testPhone });
  } catch (err) {
    console.error("Test send error:", (err as Error).message);
    return NextResponse.json(
      { error: `Test send failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
