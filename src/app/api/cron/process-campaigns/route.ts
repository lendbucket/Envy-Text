import { NextRequest, NextResponse } from "next/server";
import { isWithinQuietHours } from "@/lib/sms/compliance";

export const maxDuration = 300;

// Stub for Phase 4. Campaign processing cron.
// Quiet hours enforcement: refuse to process sends outside 8 AM - 9 PM Central.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWithinQuietHours()) {
    return NextResponse.json({
      processed: 0,
      reason: "Outside quiet hours (8 AM - 9 PM Central). Skipping.",
    });
  }

  // Phase 4 will implement the actual send loop here
  return NextResponse.json({ processed: 0 });
}
