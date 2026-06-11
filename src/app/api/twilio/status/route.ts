import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Maps Twilio status values to our internal statuses
const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const twilioSid = String(formData.get("MessageSid") || "");
  const twilioStatus = String(formData.get("MessageStatus") || "");
  const errorCode = String(formData.get("ErrorCode") || "");
  const errorMessage = String(formData.get("ErrorMessage") || "");

  if (!twilioSid || !twilioStatus) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const mappedStatus = STATUS_MAP[twilioStatus];
  if (!mappedStatus) {
    // Unknown status, just acknowledge
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = createServerClient();

    // Update the message row
    const messageUpdate: Record<string, unknown> = { status: mappedStatus };
    if (mappedStatus === "failed") {
      messageUpdate.error_code = errorCode || null;
      messageUpdate.error_message = errorMessage || null;
    }

    await supabase
      .from("messages")
      .update(messageUpdate)
      .eq("twilio_sid", twilioSid);

    // Update campaign_recipients if this message belongs to a campaign
    const recipientUpdate: Record<string, unknown> = { status: mappedStatus };
    if (mappedStatus === "failed") {
      recipientUpdate.error_code = errorCode || null;
      recipientUpdate.error_message = errorMessage || null;
    }

    await supabase
      .from("campaign_recipients")
      .update(recipientUpdate)
      .eq("twilio_sid", twilioSid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Status callback error:", (err as Error).message);
    return NextResponse.json({ ok: true }); // Always 200 so Twilio does not retry
  }
}
