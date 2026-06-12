import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Returns all distinct tags with contact counts using server-side SQL aggregation.
// Uses unnest() to expand the tags array, then groups and counts.
export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase.rpc("get_distinct_tags");

    if (error) {
      // Fallback: if the RPC doesn't exist yet, use a raw query via a
      // paginated scan. This is slower but correct.
      console.warn("[tags] RPC get_distinct_tags not found, using fallback");
      return await fallbackGetTags(supabase);
    }

    const tags = (data || []).map((row: { tag: string; count: number }) => ({
      tag: row.tag,
      count: row.count,
    }));

    return NextResponse.json({ tags });
  } catch (err) {
    console.error("Tags GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load tags" },
      { status: 500 }
    );
  }
}

async function fallbackGetTags(supabase: ReturnType<typeof createServerClient>) {
  // Paginated scan across all contacts to collect tags
  const tagCounts = new Map<string, number>();
  const BATCH = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("contacts")
      .select("tags")
      .range(offset, offset + BATCH - 1);

    if (error) throw error;

    for (const row of data || []) {
      for (const tag of row.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    if (!data || data.length < BATCH) {
      hasMore = false;
    } else {
      offset += BATCH;
    }
  }

  const tags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  return NextResponse.json({ tags });
}
