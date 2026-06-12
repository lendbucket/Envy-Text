import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { lookupNumber } from "@/lib/twilio/client";

const schema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(500),
  confirmed: z.boolean(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!parsed.data.confirmed) {
    // Return cost estimate only
    const costPerLookup = 0.005; // Twilio Lookup v2 price
    return NextResponse.json({
      count: parsed.data.contact_ids.length,
      estimated_cost: parsed.data.contact_ids.length * costPerLookup,
      message: `This will look up ${parsed.data.contact_ids.length} number${parsed.data.contact_ids.length !== 1 ? "s" : ""} at ~$0.005 each ($${(parsed.data.contact_ids.length * costPerLookup).toFixed(2)} estimated). Set confirmed=true to proceed.`,
    });
  }

  try {
    const supabase = createServerClient();

    // Fetch contacts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, phone")
      .in("id", parsed.data.contact_ids);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: "No contacts found" }, { status: 404 });
    }

    let looked = 0;
    let landlines = 0;

    for (const contact of contacts) {
      try {
        const result = await lookupNumber(contact.phone);
        await supabase
          .from("contacts")
          .update({ line_type: result.lineType })
          .eq("id", contact.id);

        looked++;
        if (result.lineType === "landline") {
          // Tag landlines
          const { data: existing } = await supabase
            .from("contacts")
            .select("tags")
            .eq("id", contact.id)
            .single();

          const tags = existing?.tags || [];
          if (!tags.includes("landline")) {
            await supabase
              .from("contacts")
              .update({ tags: [...tags, "landline"] })
              .eq("id", contact.id);
          }
          landlines++;
        }
      } catch {
        // Skip failed lookups
      }
    }

    return NextResponse.json({
      looked,
      landlines,
      message: `Looked up ${looked} number${looked !== 1 ? "s" : ""}. Found ${landlines} landline${landlines !== 1 ? "s" : ""} (tagged).`,
    });
  } catch (err) {
    console.error("Lookup error:", (err as Error).message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
