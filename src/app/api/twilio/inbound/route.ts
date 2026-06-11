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
  // Diagnostic logging: confirm the route is being hit
  console.log("[inbound] Request received", {
    method: req.method,
    contentType: req.headers.get("content-type"),
    hasSignature: !!req.headers.get("x-twilio-signature"),
    authTokenLength: (process.env.TWILIO_AUTH_TOKEN || "").length,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
  });

  // Parse form body (Twilio sends application/x-www-form-urlencoded)
  let params: Record<string, string> = {};
  try {
    const formData = await req.formData();
    formData.forEach((value, key) => {
      params[key] = String(value);
    });
  } catch (parseErr) {
    console.error("[inbound] Failed to parse form data:", (parseErr as Error).message);
    return emptyTwiml();
  }

  console.log("[inbound] Parsed params", {
    from: params.From ? `+***${params.From.slice(-4)}` : "MISSING",
    messageSid: params.MessageSid || "MISSING",
    bodyLength: (params.Body || "").length,
    numMedia: params.NumMedia || "0",
    paramKeys: Object.keys(params).join(", "),
  });

  // Validate Twilio signature
  // Use NEXT_PUBLIC_APP_URL to reconstruct the exact URL Twilio was configured to call.
  // Never trust req.url or host headers behind a reverse proxy.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/twilio/inbound`;

  const signature = req.headers.get("x-twilio-signature") || "";
  console.log("[inbound] Signature validation", {
    webhookUrl,
    signaturePresent: !!signature,
    signatureLength: signature.length,
  });

  if (!validateSignature(webhookUrl, params, signature)) {
    console.error("[inbound] Signature validation FAILED", {
      webhookUrl,
      signatureLength: signature.length,
      authTokenLength: (process.env.TWILIO_AUTH_TOKEN || "").length,
    });
    // Log what URL Twilio might have actually called for debugging
    console.error("[inbound] If Twilio called a different URL than the one above, the signature will never match. Check the Messaging Service webhook URL in Twilio Console.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  console.log("[inbound] Signature validated OK");

  const from = params.From || "";
  const body = (params.Body || "").trim();
  const twilioSid = params.MessageSid || "";
  const numMedia = parseInt(params.NumMedia || "0", 10);

  // Collect media URLs
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) mediaUrls.push(url);
  }

  if (!from) {
    console.error("[inbound] No From field in params");
    return emptyTwiml();
  }

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
        console.error("[inbound] Contact insert error:", insertErr.message);
        // Race condition: another request created it
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

    if (!contact) {
      console.error("[inbound] Failed to resolve contact");
      return emptyTwiml();
    }

    console.log("[inbound] Contact resolved", { contactId: contact.id });

    // Handle opt-out/opt-in keywords
    const bodyLower = body.toLowerCase();
    if (OPT_OUT_KEYWORDS.includes(bodyLower)) {
      await supabase
        .from("contacts")
        .update({ opted_out: true, opted_out_at: new Date().toISOString() })
        .eq("id", contact.id);
      console.log("[inbound] Opt-out processed");
    } else if (OPT_IN_KEYWORDS.includes(bodyLower)) {
      await supabase
        .from("contacts")
        .update({ opted_out: false, opted_out_at: null })
        .eq("id", contact.id);
      console.log("[inbound] Opt-in processed");
    }

    // Upsert conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("contact_id", contact.id)
      .single();

    const preview = body.length > 80 ? body.slice(0, 80) + "..." : body || "[Media]";

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          contact_id: contact.id,
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          unread_count: 1,
        })
        .select("id, unread_count")
        .single();
      if (convErr) {
        console.error("[inbound] Conversation insert error:", convErr.message);
      }
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

    if (!conversation) {
      console.error("[inbound] Failed to resolve conversation");
      return emptyTwiml();
    }

    // Insert message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      body: body || null,
      media_urls: mediaUrls,
      status: "received",
      twilio_sid: twilioSid,
    });

    if (msgErr) {
      console.error("[inbound] Message insert error:", msgErr.message);
    }

    console.log("[inbound] Message stored", {
      conversationId: conversation.id,
      messageSid: twilioSid,
    });

    // Reply attribution: check for recent campaign sends to this contact
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

    console.log("[inbound] Complete, returning TwiML");
    return emptyTwiml();
  } catch (err) {
    console.error("[inbound] Unhandled error:", (err as Error).message);
    return emptyTwiml();
  }
}
