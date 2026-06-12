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

    // Recipient status counts using server-side count queries
    const statusKeys = ["pending", "sent", "delivered", "failed", "skipped_opted_out"] as const;
    const countResults = await Promise.all(
      statusKeys.map((s) =>
        supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", id)
          .eq("status", s)
      )
    );

    const counts: Record<string, number> = {};
    for (let i = 0; i < statusKeys.length; i++) {
      counts[statusKeys[i]] = countResults[i].count || 0;
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
    const estimatedCost = data.estimated_cost || 0;
    const costPerDelivered = delivered > 0 ? estimatedCost / delivered : 0;

    // Actual cost from campaign_recipients (paginated to avoid 1000-row cap)
    let actualCostTotal = 0;
    {
      const COST_PAGE = 1000;
      let costOffset = 0;
      let costMore = true;
      while (costMore) {
        const { data: costBatch } = await supabase
          .from("campaign_recipients")
          .select("actual_price")
          .eq("campaign_id", id)
          .not("actual_price", "is", null)
          .range(costOffset, costOffset + COST_PAGE - 1);
        if (costBatch && costBatch.length > 0) {
          for (const row of costBatch) {
            actualCostTotal += Number(row.actual_price || 0);
          }
          costOffset += COST_PAGE;
          if (costBatch.length < COST_PAGE) costMore = false;
        } else {
          costMore = false;
        }
      }
    }

    // Delivery timing (avg time from sent_at to delivered)
    const { data: timingRows } = await supabase
      .from("campaign_recipients")
      .select("sent_at")
      .eq("campaign_id", id)
      .eq("status", "delivered")
      .not("sent_at", "is", null)
      .limit(1)
      .order("sent_at", { ascending: true });

    const firstSentAt = timingRows?.[0]?.sent_at || null;

    // Failure breakdown by error code
    const errorBreakdown: Record<string, number> = {};
    for (const r of failedRecipients || []) {
      const code = r.error_code || "unknown";
      errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
    }

    // Click timeline
    let clickTimeline: { clicked_at: string; contact_name: string; url: string }[] = [];
    if (trackedLinks && trackedLinks.length > 0) {
      const linkIds = trackedLinks.map((l) => l.id);
      const { data: allCodes } = await supabase
        .from("tracked_link_codes")
        .select("id, contact_id, tracked_link_id")
        .in("tracked_link_id", linkIds);

      if (allCodes && allCodes.length > 0) {
        const codeIds = allCodes.map((c) => c.id);
        const { data: allClicks } = await supabase
          .from("link_clicks")
          .select("tracked_link_code_id, clicked_at")
          .in("tracked_link_code_id", codeIds)
          .order("clicked_at", { ascending: true })
          .limit(100);

        if (allClicks) {
          // Build lookup maps
          const codeToContact = new Map(allCodes.map((c) => [c.id, c.contact_id]));
          const codeToLink = new Map(allCodes.map((c) => [c.id, c.tracked_link_id]));

          // Get contact names
          const contactIds = [...new Set(allCodes.map((c) => c.contact_id))];
          const { data: contactRows } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, phone")
            .in("id", contactIds.slice(0, 100));

          const contactMap = new Map(
            (contactRows || []).map((c) => [
              c.id,
              c.first_name || c.last_name
                ? `${c.first_name || ""} ${c.last_name || ""}`.trim()
                : c.phone,
            ])
          );

          // Get link URLs
          const { data: linkRows } = await supabase
            .from("tracked_links")
            .select("id, original_url")
            .in("id", linkIds);

          const linkMap = new Map(
            (linkRows || []).map((l) => [l.id, l.original_url])
          );

          clickTimeline = allClicks.map((click) => ({
            clicked_at: click.clicked_at,
            contact_name: contactMap.get(codeToContact.get(click.tracked_link_code_id) || "") || "Unknown",
            url: linkMap.get(codeToLink.get(click.tracked_link_code_id) || "") || "",
          }));
        }
      }
    }

    // Reply list with contact info
    const { data: replyRows } = await supabase
      .from("campaign_recipients")
      .select("id, contact_id, replied_at, contacts(phone, first_name, last_name)")
      .eq("campaign_id", id)
      .not("replied_at", "is", null)
      .order("replied_at", { ascending: false })
      .limit(100);

    const replies = (replyRows || []).map((r) => ({
      contact_id: r.contact_id,
      replied_at: r.replied_at,
      contact: r.contacts,
    }));

    // Opt-outs generated by this campaign: find contacts who opted out after the campaign started.
    // First get opted-out contacts, then check if they were recipients (avoids scanning all recipients).
    let optOuts: { contact_id: string; contact: unknown }[] = [];
    if (data.started_at) {
      const { data: optedOutRecipients } = await supabase
        .from("campaign_recipients")
        .select("contact_id, contacts(phone, first_name, last_name, opted_out, opted_out_at)")
        .eq("campaign_id", id)
        .in("status", ["sent", "delivered"])
        .limit(1000);

      optOuts = (optedOutRecipients || [])
        .filter((r) => {
          const c = r.contacts as unknown as { opted_out: boolean; opted_out_at: string | null };
          return c?.opted_out && c?.opted_out_at &&
            new Date(c.opted_out_at) >= new Date(data.started_at!);
        })
        .map((r) => ({
          contact_id: r.contact_id,
          contact: r.contacts,
        }));
    }

    return NextResponse.json({
      ...data,
      recipient_stats: counts,
      replied_count: repliedCount || 0,
      clicked_count: clickedCount,
      cost_per_delivered: costPerDelivered,
      actual_cost_total: actualCostTotal,
      first_sent_at: firstSentAt,
      error_breakdown: Object.entries(errorBreakdown).map(([code, count]) => ({ code, count })),
      click_timeline: clickTimeline,
      replies,
      opt_outs: optOuts,
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
