import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("status")
      .eq("id", id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!["draft", "scheduled"].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a campaign with status "${campaign.status}"` },
        { status: 400 }
      );
    }

    await supabase
      .from("campaigns")
      .update({ status: "cancelled" })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Campaign cancel error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to cancel campaign" }, { status: 500 });
  }
}
