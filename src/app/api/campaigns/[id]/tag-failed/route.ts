import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    // Get all failed recipients for this campaign (paginated)
    const contactIds: string[] = [];
    const PAGE = 1000;
    let offset = 0;
    let more = true;
    while (more) {
      const { data: batch } = await supabase
        .from("campaign_recipients")
        .select("contact_id")
        .eq("campaign_id", id)
        .eq("status", "failed")
        .range(offset, offset + PAGE - 1);
      if (batch && batch.length > 0) {
        contactIds.push(...batch.map((r) => r.contact_id));
        offset += PAGE;
        if (batch.length < PAGE) more = false;
      } else {
        more = false;
      }
    }

    if (contactIds.length === 0) {
      return NextResponse.json({ ok: true, tagged: 0 });
    }

    // Get current tags for each contact in batches, merge in "invalid-number"
    let tagged = 0;
    for (let i = 0; i < contactIds.length; i += PAGE) {
      const chunk = contactIds.slice(i, i + PAGE);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, tags")
        .in("id", chunk);

      for (const contact of contacts || []) {
        const currentTags: string[] = contact.tags || [];
        if (currentTags.includes("invalid-number")) continue;
        const merged = [...currentTags, "invalid-number"];
        await supabase
          .from("contacts")
          .update({ tags: merged })
          .eq("id", contact.id);
        tagged++;
      }
    }

    return NextResponse.json({ ok: true, tagged });
  } catch (err) {
    console.error("Tag failed error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to tag contacts" }, { status: 500 });
  }
}
