import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const bulkTagSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1),
  tags: z.array(z.string().min(1)).min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bulkTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk tag data" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { contact_ids, tags } = parsed.data;

    // Fetch current tags for each contact, then merge
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, tags")
      .in("id", contact_ids);

    if (fetchError) throw fetchError;

    for (const contact of contacts || []) {
      const currentTags = contact.tags || [];
      const merged = Array.from(new Set([...currentTags, ...tags]));
      const { error } = await supabase
        .from("contacts")
        .update({ tags: merged })
        .eq("id", contact.id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, updated: contact_ids.length });
  } catch (err) {
    console.error("Bulk tag error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to tag contacts" },
      { status: 500 }
    );
  }
}
