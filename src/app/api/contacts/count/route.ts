import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const tags = req.nextUrl.searchParams.get("tags") || "";

  try {
    const supabase = createServerClient();

    // Count active (non-opted-out) contacts
    let activeQuery = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("opted_out", false);

    let optedOutQuery = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("opted_out", true);

    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim());
      activeQuery = activeQuery.overlaps("tags", tagList);
      optedOutQuery = optedOutQuery.overlaps("tags", tagList);
    }

    const [activeResult, optedOutResult] = await Promise.all([
      activeQuery,
      optedOutQuery,
    ]);

    if (activeResult.error) throw activeResult.error;
    if (optedOutResult.error) throw optedOutResult.error;

    return NextResponse.json({
      active: activeResult.count || 0,
      opted_out: optedOutResult.count || 0,
    });
  } catch (err) {
    console.error("Contacts count error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to count contacts" },
      { status: 500 }
    );
  }
}
