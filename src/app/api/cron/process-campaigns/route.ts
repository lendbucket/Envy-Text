import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

// Stub for Phase 4. Campaign processing cron.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ processed: 0 });
}
