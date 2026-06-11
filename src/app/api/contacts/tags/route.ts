import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Returns all distinct tags across contacts
export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("contacts")
      .select("tags");

    if (error) throw error;

    const tagSet = new Set<string>();
    for (const row of data || []) {
      for (const tag of row.tags || []) {
        tagSet.add(tag);
      }
    }

    const tags = Array.from(tagSet).sort();
    return NextResponse.json({ tags });
  } catch (err) {
    console.error("Tags GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load tags" },
      { status: 500 }
    );
  }
}
