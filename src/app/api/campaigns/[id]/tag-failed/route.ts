import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();

    // Get all failed recipients for this campaign
    const { data: failed } = await supabase
      .from("campaign_recipients")
      .select("contact_id")
      .eq("campaign_id", id)
      .eq("status", "failed");

    if (!failed || failed.length === 0) {
      return NextResponse.json({ ok: true, tagged: 0 });
    }

    const contactIds = failed.map((r) => r.contact_id);

    // Get current tags for each contact, merge in "invalid-number"
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, tags")
      .in("id", contactIds);

    let tagged = 0;
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

    return NextResponse.json({ ok: true, tagged });
  } catch (err) {
    console.error("Tag failed error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to tag contacts" }, { status: 500 });
  }
}
