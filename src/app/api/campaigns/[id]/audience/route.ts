import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const schema = z.object({
  groups: z.array(z.enum(["clicked", "replied", "engaged", "no_response"])).min(1),
  tag: z.string().min(1).max(100),
  action: z.enum(["tag", "export"]),
});

const PAGE = 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { groups, tag, action } = parsed.data;

  try {
    const supabase = createServerClient();

    // Resolve contact IDs for the selected groups
    const contactIds = await resolveAudienceContactIds(supabase, id, groups);

    if (action === "export") {
      // Fetch contact details for CSV export (paginated)
      const rows: { phone: string; first_name: string; last_name: string; tags: string[] }[] = [];
      for (let i = 0; i < contactIds.length; i += PAGE) {
        const chunk = contactIds.slice(i, i + PAGE);
        const { data } = await supabase
          .from("contacts")
          .select("phone, first_name, last_name, tags")
          .in("id", chunk);
        if (data) rows.push(...data);
      }

      // Build CSV
      const header = "phone,first_name,last_name,tags";
      const csvRows = rows.map((r) => {
        const phone = r.phone || "";
        const first = (r.first_name || "").replace(/"/g, '""');
        const last = (r.last_name || "").replace(/"/g, '""');
        const tags = (r.tags || []).join("; ");
        return `"${phone}","${first}","${last}","${tags}"`;
      });

      const csv = [header, ...csvRows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${tag || "audience"}.csv"`,
        },
      });
    }

    // Tag action: merge tag into each contact's tags array (paginated)
    let tagged = 0;
    for (let i = 0; i < contactIds.length; i += PAGE) {
      const chunk = contactIds.slice(i, i + PAGE);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, tags")
        .in("id", chunk);

      for (const contact of contacts || []) {
        const currentTags: string[] = contact.tags || [];
        if (currentTags.includes(tag)) continue;
        const merged = [...currentTags, tag];
        await supabase
          .from("contacts")
          .update({ tags: merged })
          .eq("id", contact.id);
        tagged++;
      }
    }

    return NextResponse.json({
      ok: true,
      tagged,
      total: contactIds.length,
      message: `Tagged ${tagged} contact${tagged !== 1 ? "s" : ""} with "${tag}"`,
    });
  } catch (err) {
    console.error("Audience action error:", (err as Error).message);
    return NextResponse.json({ error: "Audience action failed" }, { status: 500 });
  }
}

async function resolveAudienceContactIds(
  supabase: ReturnType<typeof createServerClient>,
  campaignId: string,
  groups: string[]
): Promise<string[]> {
  const needClicked = groups.includes("clicked") || groups.includes("engaged");
  const needReplied = groups.includes("replied") || groups.includes("engaged");
  const needNoResponse = groups.includes("no_response");

  // Get clicked contact IDs
  const clickedIds = new Set<string>();
  if (needClicked) {
    const { data: trackedLinks } = await supabase
      .from("tracked_links")
      .select("id")
      .eq("campaign_id", campaignId);

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
          const clickedCodes = new Set(clicks.map((c) => c.tracked_link_code_id));
          for (const code of codes) {
            if (clickedCodes.has(code.id)) clickedIds.add(code.contact_id);
          }
        }
      }
    }
  }

  // Get replied contact IDs (paginated)
  const repliedIds = new Set<string>();
  if (needReplied) {
    let offset = 0;
    let more = true;
    while (more) {
      const { data } = await supabase
        .from("campaign_recipients")
        .select("contact_id")
        .eq("campaign_id", campaignId)
        .not("replied_at", "is", null)
        .range(offset, offset + PAGE - 1);
      for (const r of data || []) repliedIds.add(r.contact_id);
      if (!data || data.length < PAGE) more = false;
      else offset += PAGE;
    }
  }

  // Collect IDs based on selected groups
  const result = new Set<string>();

  if (groups.includes("clicked")) {
    for (const id of clickedIds) result.add(id);
  }
  if (groups.includes("replied")) {
    for (const id of repliedIds) result.add(id);
  }
  if (groups.includes("engaged")) {
    for (const id of clickedIds) result.add(id);
    for (const id of repliedIds) result.add(id);
  }

  if (needNoResponse) {
    // Get all delivered/sent recipients, exclude engaged
    const engagedIds = new Set([...clickedIds, ...repliedIds]);
    let offset = 0;
    let more = true;
    while (more) {
      const { data } = await supabase
        .from("campaign_recipients")
        .select("contact_id")
        .eq("campaign_id", campaignId)
        .in("status", ["sent", "delivered"])
        .range(offset, offset + PAGE - 1);
      for (const r of data || []) {
        if (!engagedIds.has(r.contact_id)) result.add(r.contact_id);
      }
      if (!data || data.length < PAGE) more = false;
      else offset += PAGE;
    }
  }

  return Array.from(result);
}
