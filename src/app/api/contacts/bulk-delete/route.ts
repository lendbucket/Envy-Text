import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const bulkDeleteSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("contacts")
      .delete()
      .in("id", parsed.data.contact_ids);

    if (error) throw error;

    return NextResponse.json({ ok: true, deleted: parsed.data.contact_ids.length });
  } catch (err) {
    console.error("Bulk delete error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to delete contacts" },
      { status: 500 }
    );
  }
}
