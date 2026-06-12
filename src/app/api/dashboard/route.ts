import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "0", 10);

  try {
    const supabase = createServerClient();
    const dateFilter = days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Total messages sent (outbound)
    const { count: totalSent } = await (() => {
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound");
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    // Total messages received (inbound)
    const { count: totalReceived } = await (() => {
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound");
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    // Delivered count
    const { count: deliveredCount } = await (() => {
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .eq("status", "delivered");
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    // Failed count
    const { count: failedCount } = await (() => {
      let q = supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "outbound")
        .eq("status", "failed");
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    // Opt-out count
    const { count: optOutCount } = await (() => {
      let q = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", true);
      if (dateFilter) q = q.gte("opted_out_at", dateFilter);
      return q;
    })();

    // Total contacts for opt-out rate
    const { count: totalContacts } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true });

    // Reply count (inbound messages that are not opt-out keywords)
    const { count: replyCount } = await (() => {
      let q = supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .not("replied_at", "is", null);
      if (dateFilter) q = q.gte("replied_at", dateFilter);
      return q;
    })();

    // Link clicks
    const { count: clickCount } = await (() => {
      let q = supabase
        .from("link_clicks")
        .select("id", { count: "exact", head: true });
      if (dateFilter) q = q.gte("clicked_at", dateFilter);
      return q;
    })();

    // Actual spend from messages with actual_price
    const { data: spendData } = await (() => {
      let q = supabase
        .from("messages")
        .select("actual_price, estimated_cost")
        .eq("direction", "outbound")
        .in("status", ["sent", "delivered"]);
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    let actualSpend = 0;
    let estimatedSpend = 0;
    for (const row of spendData || []) {
      if (row.actual_price) actualSpend += Number(row.actual_price);
      if (row.estimated_cost) estimatedSpend += Number(row.estimated_cost);
    }

    // Messages over time (daily buckets, last N days or all time capped at 90 days)
    const chartDays = days || 30;
    const chartStart = new Date(Date.now() - chartDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: chartMessages } = await supabase
      .from("messages")
      .select("direction, created_at")
      .gte("created_at", chartStart)
      .order("created_at", { ascending: true });

    const dailyMessages: Record<string, { outbound: number; inbound: number }> = {};
    for (const msg of chartMessages || []) {
      const day = msg.created_at.slice(0, 10);
      if (!dailyMessages[day]) dailyMessages[day] = { outbound: 0, inbound: 0 };
      dailyMessages[day][msg.direction as "outbound" | "inbound"]++;
    }

    // Spend over time (daily buckets)
    const dailySpend: Record<string, number> = {};
    for (const msg of spendData || []) {
      // We need created_at for these -- refetch with dates
    }

    const { data: spendTimeline } = await supabase
      .from("messages")
      .select("actual_price, estimated_cost, created_at")
      .eq("direction", "outbound")
      .in("status", ["sent", "delivered"])
      .gte("created_at", chartStart)
      .order("created_at", { ascending: true });

    for (const msg of spendTimeline || []) {
      const day = msg.created_at.slice(0, 10);
      if (!dailySpend[day]) dailySpend[day] = 0;
      dailySpend[day] += Number(msg.actual_price || msg.estimated_cost || 0);
    }

    // Failure breakdown by error code
    const { data: failures } = await (() => {
      let q = supabase
        .from("messages")
        .select("error_code")
        .eq("direction", "outbound")
        .eq("status", "failed")
        .not("error_code", "is", null);
      if (dateFilter) q = q.gte("created_at", dateFilter);
      return q;
    })();

    const errorBreakdown: Record<string, number> = {};
    for (const row of failures || []) {
      const code = row.error_code || "unknown";
      errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
    }

    const outboundTotal = totalSent || 0;
    const deliveredRate = outboundTotal > 0 ? ((deliveredCount || 0) / outboundTotal) * 100 : 0;
    const failedRate = outboundTotal > 0 ? ((failedCount || 0) / outboundTotal) * 100 : 0;
    const optOutRate = (totalContacts || 0) > 0 ? ((optOutCount || 0) / (totalContacts || 1)) * 100 : 0;
    const replyRate = outboundTotal > 0 ? ((replyCount || 0) / outboundTotal) * 100 : 0;
    const clickThroughRate = outboundTotal > 0 ? ((clickCount || 0) / outboundTotal) * 100 : 0;

    return NextResponse.json({
      totalSent: totalSent || 0,
      totalReceived: totalReceived || 0,
      deliveredCount: deliveredCount || 0,
      deliveredRate,
      failedCount: failedCount || 0,
      failedRate,
      actualSpend,
      estimatedSpend,
      optOutCount: optOutCount || 0,
      optOutRate,
      replyCount: replyCount || 0,
      replyRate,
      clickCount: clickCount || 0,
      clickThroughRate,
      messagesOverTime: Object.entries(dailyMessages)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      spendOverTime: Object.entries(dailySpend)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      errorBreakdown: Object.entries(errorBreakdown)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    console.error("Dashboard error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
