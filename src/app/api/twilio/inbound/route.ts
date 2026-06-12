import { NextRequest, NextResponse } from "next/server";
import { validateSignature } from "@/lib/twilio/client";
import { createServerClient } from "@/lib/supabase/server";

const OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const OPT_IN_KEYWORDS = ["start", "unstop"];

function emptyTwiml() {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
}

export async function POST(req: NextRequest) {
  let params: Record<string, string> = {};
  try {
    const formData = await req.formData();
    formData.forEach((value, key) => {
      params[key] = String(value);
    });
  } catch {
    return emptyTwiml();
  }

  // Validate Twilio signature using the actual request URL so it matches
  // exactly what Twilio called, regardless of env var or proxy differences.
  const signature = req.headers.get("x-twilio-signature") || "";
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = req.headers.get("host") || "";
  const webhookUrl = `${proto}://${host}/api/twilio/inbound`;

  if (!validateSignature(webhookUrl, params, signature)) {
    const envUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const fallbackUrl = envUrl ? `${envUrl}/api/twilio/inbound` : "";
    if (!fallbackUrl || !validateSignature(fallbackUrl, params, signature)) {
      console.error(`[inbound] Signature validation failed. Tried: ${webhookUrl} and ${fallbackUrl}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  const from = params.From || "";
  const body = (params.Body || "").trim();
  const twilioSid = params.MessageSid || "";
  const numMedia = parseInt(params.NumMedia || "0", 10);

  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }

  if (!from) return emptyTwiml();

  try {
    const supabase = createServerClient();

    // Look up or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("id, opted_out")
      .eq("phone", from)
      .single();

    if (!contact) {
      const { data: newContact, error: insertErr } = await supabase
        .from("contacts")
        .insert({ phone: from, source: "inbound" })
        .select("id, opted_out")
        .single();

      if (insertErr) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("id, opted_out")
          .eq("phone", from)
          .single();
        contact = existing;
      } else {
        contact = newContact;
      }
    }

    if (!contact) return emptyTwiml();

    // Handle opt-out/opt-in keywords
    const bodyLower = body.toLowerCase();
    if (OPT_OUT_KEYWORDS.includes(bodyLower)) {
      await supabase
        .from("contacts")
        .update({ opted_out: true, opted_out_at: new Date().toISOString() })
        .eq("id", contact.id);
    } else if (OPT_IN_KEYWORDS.includes(bodyLower)) {
      await supabase
        .from("contacts")
        .update({ opted_out: false, opted_out_at: null })
        .eq("id", contact.id);
    }

    // Upsert conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("contact_id", contact.id)
      .single();

    const preview = body.length > 80 ? body.slice(0, 80) + "..." : body || "[Media]";

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          contact_id: contact.id,
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          unread_count: 1,
        })
        .select("id, unread_count")
        .single();
      conversation = newConv;
    } else {
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          unread_count: (conversation.unread_count || 0) + 1,
        })
        .eq("id", conversation.id);
    }

    if (!conversation) return emptyTwiml();

    // Insert message
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      body: body || null,
      media_urls: mediaUrls,
      status: "received",
      twilio_sid: twilioSid,
    });

    // Reply attribution: recent campaign sends to this contact
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: recentRecipient } = await supabase
      .from("campaign_recipients")
      .select("id")
      .eq("contact_id", contact.id)
      .in("status", ["sent", "delivered"])
      .gte("sent_at", seventyTwoHoursAgo)
      .is("replied_at", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    if (recentRecipient) {
      await supabase
        .from("campaign_recipients")
        .update({ replied_at: new Date().toISOString() })
        .eq("id", recentRecipient.id);
    }

    return emptyTwiml();
  } catch (err) {
    console.error("[inbound] error:", (err as Error).message);
    return emptyTwiml();
  }
}
