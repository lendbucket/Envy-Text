import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
  const before = req.nextUrl.searchParams.get("before") || null;

  try {
    const supabase = createServerClient();

    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ messages: data || [] });
  } catch (err) {
    console.error("Messages GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}
