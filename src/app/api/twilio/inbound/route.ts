import { NextResponse } from "next/server";

// Stub for Phase 3. Twilio inbound webhook.
export async function POST() {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
}
