import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const contactRow = z.object({
  phone: z.string().min(1, "Phone is required"),
  first_name: z.string().optional().default(""),
  last_name: z.string().optional().default(""),
  email: z.string().optional().default(""),
  opt_in_source: z.string().optional().default(""),
});

// Client sends in chunks of 500, so cap at 500 per request
const importSchema = z.object({
  contacts: z.array(contactRow).min(1).max(500),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body. The payload may exceed the size limit." },
      { status: 400 }
    );
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = flat.fieldErrors;
    let detail = "Validation failed.";

    if (fieldErrors.contacts) {
      detail = `contacts: ${fieldErrors.contacts.join(", ")}`;
    } else {
      // Check for per-row errors
      const issues = parsed.error.issues.slice(0, 5);
      detail = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    }

    console.error("[import] Zod validation failed:", detail);
    return NextResponse.json(
      { error: `Invalid import data: ${detail}` },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { contacts, tags = [] } = parsed.data;
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    const phones = contacts.map((c) => c.phone);

    // Fetch existing contacts by phone
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, phone, first_name, last_name, email, tags")
      .in("phone", phones);

    const existingMap = new Map(
      (existing || []).map((c) => [c.phone, c])
    );

    for (const row of contacts) {
      const ex = existingMap.get(row.phone);

      if (ex) {
        // Update: fill only where empty, merge tags, never overwrite
        const updates: Record<string, unknown> = {};
        if (!ex.first_name && row.first_name) updates.first_name = row.first_name;
        if (!ex.last_name && row.last_name) updates.last_name = row.last_name;
        if (!ex.email && row.email) updates.email = row.email;
        if (row.opt_in_source) updates.opt_in_source = row.opt_in_source;

        // Merge tags
        const mergedTags = Array.from(
          new Set([...(ex.tags || []), ...tags])
        );
        if (mergedTags.length > (ex.tags || []).length) {
          updates.tags = mergedTags;
        }

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from("contacts")
            .update(updates)
            .eq("id", ex.id);
          if (error) {
            console.error("[import] Update error:", error.message);
            skipped++;
            continue;
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Insert new contact
        const { error } = await supabase.from("contacts").insert({
          phone: row.phone,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          email: row.email || null,
          opt_in_source: row.opt_in_source || null,
          tags,
          source: "csv",
        });
        if (error) {
          if (error.code === "23505") {
            skipped++;
          } else {
            console.error("[import] Insert error:", error.message);
            skipped++;
          }
          continue;
        }
        imported++;
      }
    }

    return NextResponse.json({ imported, updated, skipped });
  } catch (err) {
    console.error("[import] Unhandled error:", (err as Error).message);
    return NextResponse.json(
      { error: "Import failed on the server. Check logs for details." },
      { status: 500 }
    );
  }
}
