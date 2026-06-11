import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get recipient stats
    const { data: stats } = await supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", id);

    const counts = { pending: 0, sent: 0, delivered: 0, failed: 0, skipped_opted_out: 0 };
    for (const row of stats || []) {
      const s = row.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    return NextResponse.json({ ...data, recipient_stats: counts });
  } catch (err) {
    console.error("Campaign GET error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}
