import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { validateSignature, fetchMessagePrice } from "@/lib/twilio/client";

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
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Validate Twilio signature
  const signature = req.headers.get("x-twilio-signature") || "";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/twilio/status`;

  if (!validateSignature(webhookUrl, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const twilioSid = params.MessageSid || "";
  const twilioStatus = params.MessageStatus || "";
  const errorCode = params.ErrorCode || "";
  const errorMessage = params.ErrorMessage || "";

  if (!twilioSid || !twilioStatus) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const mappedStatus = STATUS_MAP[twilioStatus];
  if (!mappedStatus) {
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = createServerClient();

    const messageUpdate: Record<string, unknown> = { status: mappedStatus };
    if (mappedStatus === "failed") {
      messageUpdate.error_code = errorCode || null;
      messageUpdate.error_message = errorMessage || null;
    }

    // On delivered or failed, fetch actual price from Twilio
    if (mappedStatus === "delivered" || mappedStatus === "failed") {
      try {
        const priceInfo = await fetchMessagePrice(twilioSid);
        if (priceInfo) {
          messageUpdate.actual_price = priceInfo.price;
          messageUpdate.actual_segments = priceInfo.segments;
        }
      } catch {
        // Non-critical: price fetch can fail without blocking status update
      }
    }

    await supabase
      .from("messages")
      .update(messageUpdate)
      .eq("twilio_sid", twilioSid);

    const recipientUpdate: Record<string, unknown> = { status: mappedStatus };
    if (mappedStatus === "failed") {
      recipientUpdate.error_code = errorCode || null;
      recipientUpdate.error_message = errorMessage || null;
    }
    if (messageUpdate.actual_price !== undefined) {
      recipientUpdate.actual_price = messageUpdate.actual_price;
      recipientUpdate.actual_segments = messageUpdate.actual_segments;
    }

    await supabase
      .from("campaign_recipients")
      .update(recipientUpdate)
      .eq("twilio_sid", twilioSid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[status] callback error:", (err as Error).message);
    return NextResponse.json({ ok: true });
  }
}
