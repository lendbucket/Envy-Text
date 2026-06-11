import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Mark a conversation as read (reset unread count)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createServerClient();
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Read POST error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
