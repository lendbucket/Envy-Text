import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/twilio/client";
import { analyzeMessage } from "@/lib/sms/segments";

const sendSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1),
  media_urls: z.array(z.string().url()).optional(),
});

export async function POST(req: NextRequest) {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { conversation_id, body, media_urls = [] } = parsed.data;

  try {
    const supabase = createServerClient();

    // Get conversation and contact
    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact_id")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, phone, opted_out")
      .eq("id", conversation.contact_id)
      .single();

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (contact.opted_out) {
      return NextResponse.json(
        { error: "This contact has opted out of messaging" },
        { status: 400 }
      );
    }

    // Calculate segments and cost
    const segmentInfo = analyzeMessage(body, media_urls.length > 0);

    // Fetch pricing
    const { data: pricingRows } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["sms_price_per_segment", "mms_price", "carrier_fee_per_sms", "carrier_fee_per_mms"]);

    const pricing: Record<string, number> = {};
    for (const row of pricingRows || []) {
      pricing[row.key] = parseFloat(String(row.value));
    }

    let estimatedCost: number;
    if (segmentInfo.isMms) {
      estimatedCost = (pricing.mms_price || 0.02) + (pricing.carrier_fee_per_mms || 0.01);
    } else {
      estimatedCost =
        segmentInfo.segmentCount * (pricing.sms_price_per_segment || 0.0079) +
        segmentInfo.segmentCount * (pricing.carrier_fee_per_sms || 0.003);
    }

    // Create message as queued
    const { data: message, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        direction: "outbound",
        body,
        media_urls,
        status: "queued",
        segments: segmentInfo.segmentCount,
        estimated_cost: estimatedCost,
      })
      .select()
      .single();

    if (msgErr || !message) {
      return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
    }

    // Send via Twilio
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com";
    try {
      const result = await sendMessage({
        to: contact.phone,
        body,
        mediaUrls: media_urls.length > 0 ? media_urls : undefined,
        statusCallback: `${appUrl}/api/twilio/status`,
      });

      // Update to sent
      await supabase
        .from("messages")
        .update({ status: "sent", twilio_sid: result.sid })
        .eq("id", message.id);

      // Update conversation preview
      const preview = body.length > 80 ? body.slice(0, 80) + "..." : body;
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
        })
        .eq("id", conversation_id);

      return NextResponse.json({
        ...message,
        status: "sent",
        twilio_sid: result.sid,
      });
    } catch (twilioErr) {
      const errMsg = (twilioErr as Error).message;
      await supabase
        .from("messages")
        .update({
          status: "failed",
          error_message: errMsg,
        })
        .eq("id", message.id);

      return NextResponse.json({
        ...message,
        status: "failed",
        error_message: errMsg,
      });
    }
  } catch (err) {
    console.error("Send error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
