import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Link click tracker. Logs the click and 302 redirects to the original URL.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const supabase = createServerClient();

    // Look up the short code
    const { data: linkCode } = await supabase
      .from("tracked_link_codes")
      .select("id, tracked_link_id")
      .eq("short_code", code)
      .single();

    if (!linkCode) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Get the original URL
    const { data: trackedLink } = await supabase
      .from("tracked_links")
      .select("original_url")
      .eq("id", linkCode.tracked_link_id)
      .single();

    if (!trackedLink) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Log the click
    const userAgent = req.headers.get("user-agent") || "";
    await supabase.from("link_clicks").insert({
      tracked_link_code_id: linkCode.id,
      user_agent: userAgent,
    });

    // 302 redirect
    return NextResponse.redirect(trackedLink.original_url, 302);
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
