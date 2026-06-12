import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { reconcileCampaign } from "@/lib/twilio/reconcile";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    // Verify campaign exists
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const result = await reconcileCampaign(supabase, id);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[reconcile] error:", (err as Error).message);
    return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
  }
}
