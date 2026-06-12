import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") || "";
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  try {
    const supabase = createServerClient();

    // Join conversations with contacts to get name/phone
    let query = supabase
      .from("conversations")
      .select(`
        id,
        contact_id,
        last_message_at,
        last_message_preview,
        unread_count,
        created_at,
        contacts (
          id,
          phone,
          first_name,
          last_name,
          tags,
          opted_out,
          notes
        )
      `)
      .order("last_message_at", { ascending: false })
      .limit(500);

    if (unreadOnly) {
      query = query.gt("unread_count", 0);
    }

    const { data, error } = await query;
    if (error) throw error;

    let conversations = data || [];

    // Client-side search filter (searching across the joined contact fields)
    if (search) {
      const lower = search.toLowerCase();
      conversations = conversations.filter((c) => {
        const contact = c.contacts as unknown as {
          phone: string;
          first_name: string | null;
          last_name: string | null;
        } | null;
        if (!contact) return false;
        return (
          contact.phone.includes(lower) ||
          (contact.first_name || "").toLowerCase().includes(lower) ||
          (contact.last_name || "").toLowerCase().includes(lower)
        );
      });
    }

    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("Conversations GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}
