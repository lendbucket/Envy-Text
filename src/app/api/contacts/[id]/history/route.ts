import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    // Get campaigns this contact was part of
    const { data: recipients } = await supabase
      .from("campaign_recipients")
      .select("campaign_id, status, sent_at, replied_at, actual_price, campaigns(name, status)")
      .eq("contact_id", id)
      .order("sent_at", { ascending: false })
      .limit(50);

    // Get click data for this contact
    const { data: clickCodes } = await supabase
      .from("tracked_link_codes")
      .select("id, tracked_link_id, tracked_links(campaign_id)")
      .eq("contact_id", id);

    let clicksByCampaign: Record<string, number> = {};
    if (clickCodes && clickCodes.length > 0) {
      const codeIds = clickCodes.map((c) => c.id);
      const { count: totalClicks } = await supabase
        .from("link_clicks")
        .select("id", { count: "exact", head: true })
        .in("tracked_link_code_id", codeIds);

      // Group clicks by campaign
      const { data: clicks } = await supabase
        .from("link_clicks")
        .select("tracked_link_code_id")
        .in("tracked_link_code_id", codeIds);

      const codeToCampaign = new Map<string, string>();
      for (const code of clickCodes) {
        const link = code.tracked_links as unknown as { campaign_id: string } | null;
        if (link) codeToCampaign.set(code.id, link.campaign_id);
      }

      for (const click of clicks || []) {
        const campId = codeToCampaign.get(click.tracked_link_code_id);
        if (campId) {
          clicksByCampaign[campId] = (clicksByCampaign[campId] || 0) + 1;
        }
      }

      // unused but keep for consistent response
      void totalClicks;
    }

    const history = (recipients || []).map((r) => {
      const camp = r.campaigns as unknown as { name: string; status: string } | null;
      return {
        campaign_id: r.campaign_id,
        campaign_name: camp?.name || "Unknown",
        campaign_status: camp?.status || "unknown",
        delivery_status: r.status,
        sent_at: r.sent_at,
        replied: !!r.replied_at,
        replied_at: r.replied_at,
        clicks: clicksByCampaign[r.campaign_id] || 0,
        actual_price: r.actual_price,
      };
    });

    return NextResponse.json({ history });
  } catch (err) {
    console.error("Contact history error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
