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

    // Recipient status counts
    const { data: recipients } = await supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", id);

    const counts = { pending: 0, sent: 0, delivered: 0, failed: 0, skipped_opted_out: 0 };
    for (const row of recipients || []) {
      const s = row.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    // Replied count (replied_at is not null)
    const { count: repliedCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .not("replied_at", "is", null);

    // Clicked count: distinct contacts who clicked any tracked link for this campaign
    const { data: trackedLinks } = await supabase
      .from("tracked_links")
      .select("id")
      .eq("campaign_id", id);

    let clickedCount = 0;
    if (trackedLinks && trackedLinks.length > 0) {
      const linkIds = trackedLinks.map((l) => l.id);
      const { data: codes } = await supabase
        .from("tracked_link_codes")
        .select("id, contact_id")
        .in("tracked_link_id", linkIds);

      if (codes && codes.length > 0) {
        const codeIds = codes.map((c) => c.id);
        const { data: clicks } = await supabase
          .from("link_clicks")
          .select("tracked_link_code_id")
          .in("tracked_link_code_id", codeIds);

        if (clicks) {
          const clickedCodeIds = new Set(clicks.map((c) => c.tracked_link_code_id));
          const clickedContactIds = new Set<string>();
          for (const code of codes) {
            if (clickedCodeIds.has(code.id)) {
              clickedContactIds.add(code.contact_id);
            }
          }
          clickedCount = clickedContactIds.size;
        }
      }
    }

    // Failed recipients with error codes and contact info
    const { data: failedRecipients } = await supabase
      .from("campaign_recipients")
      .select("id, contact_id, error_code, error_message, contacts(phone, first_name, last_name)")
      .eq("campaign_id", id)
      .eq("status", "failed");

    // Cost per delivered
    const pricing = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["sms_price_per_segment", "carrier_fee_per_sms", "mms_price", "carrier_fee_per_mms"]);

    const prices: Record<string, number> = {};
    for (const row of pricing.data || []) {
      prices[row.key] = parseFloat(String(row.value));
    }

    const delivered = counts.delivered;
    const actualCost = data.estimated_cost || 0;
    const costPerDelivered = delivered > 0 ? actualCost / delivered : 0;

    return NextResponse.json({
      ...data,
      recipient_stats: counts,
      replied_count: repliedCount || 0,
      clicked_count: clickedCount,
      cost_per_delivered: costPerDelivered,
      failed_recipients: (failedRecipients || []).map((r) => ({
        id: r.id,
        contact_id: r.contact_id,
        error_code: r.error_code,
        error_message: r.error_message,
        contact: r.contacts,
      })),
    });
  } catch (err) {
    console.error("Campaign GET error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}
