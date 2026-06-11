import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1),
  media_urls: z.array(z.string()).optional(),
  audience_type: z.enum(["all", "tags"]),
  audience_tags: z.array(z.string()).optional(),
  scheduled_at: z.string().nullable().optional(),
  estimated_cost: z.number().optional(),
  recipient_count: z.number().optional(),
  append_opt_out: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ campaigns: data || [] });
  } catch (err) {
    console.error("Campaigns GET error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid campaign data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    // If scheduled_at is set, mark as scheduled so the cron picks it up
    const status = parsed.data.scheduled_at ? "scheduled" : "draft";

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        ...parsed.data,
        status,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Campaign POST error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
