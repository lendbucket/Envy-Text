import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  opted_out: z.boolean().optional(),
  opt_in_source: z.string().nullable().optional(),
});

export async function PUT(
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.opted_out !== undefined) {
      updateData.opted_out_at = parsed.data.opted_out ? new Date().toISOString() : null;
    }

    const { data, error } = await supabase
      .from("contacts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Contact PUT error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("contacts").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact DELETE error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 }
    );
  }
}
