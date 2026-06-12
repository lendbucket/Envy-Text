import twilio from "twilio";
import type { MessageListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/message";

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Missing Twilio credentials");
  client = twilio(sid, token);
  return client;
}

interface SendOptions {
  to: string;
  body: string;
  mediaUrls?: string[];
  statusCallback?: string;
}

export async function sendMessage(opts: SendOptions) {
  const tw = getClient();

  const params: MessageListInstanceCreateOptions = {
    to: opts.to,
    body: opts.body,
  };

  // Use messagingServiceSid when available, otherwise from number
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  } else {
    params.from = process.env.TWILIO_PHONE_NUMBER;
  }

  if (opts.mediaUrls && opts.mediaUrls.length > 0) {
    params.mediaUrl = opts.mediaUrls;
  }

  if (opts.statusCallback) {
    params.statusCallback = opts.statusCallback;
  }

  const message = await tw.messages.create(params);
  return { sid: message.sid, status: message.status };
}

export function validateSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, url, params);
}

export async function fetchMessagePrice(
  sid: string
): Promise<{ price: number; segments: number } | null> {
  const tw = getClient();
  const msg = await tw.messages(sid).fetch();
  if (msg.price && msg.numSegments) {
    return {
      price: Math.abs(parseFloat(msg.price)),
      segments: parseInt(msg.numSegments, 10),
    };
  }
  return null;
}

const TWILIO_STATUS_MAP: Record<string, string> = {
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export interface TwilioMessageStatus {
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  price: number | null;
  segments: number | null;
}

export async function fetchMessageStatus(
  sid: string
): Promise<TwilioMessageStatus> {
  const tw = getClient();
  const msg = await tw.messages(sid).fetch();
  const mapped = TWILIO_STATUS_MAP[msg.status] || msg.status;
  return {
    status: mapped,
    errorCode: msg.errorCode != null ? String(msg.errorCode) : null,
    errorMessage: msg.errorMessage || null,
    price: msg.price ? Math.abs(parseFloat(msg.price)) : null,
    segments: msg.numSegments ? parseInt(msg.numSegments, 10) : null,
  };
}

export async function lookupNumber(
  phone: string
): Promise<{ lineType: string | null }> {
  const tw = getClient();
  const lookup = await tw.lookups.v2.phoneNumbers(phone).fetch({ fields: "line_type_intelligence" });
  const lineType = lookup.lineTypeIntelligence?.type || null;
  return { lineType };
}
