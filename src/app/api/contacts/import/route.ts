import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const contactRow = z.object({
  phone: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
});

const importSchema = z.object({
  contacts: z.array(contactRow).min(1).max(10000),
  tags: z.array(z.string()).optional(),
});

const CHUNK_SIZE = 500;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { contacts, tags = [] } = parsed.data;
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    // Process in chunks
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE);
      const phones = chunk.map((c) => c.phone);

      // Fetch existing contacts by phone
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, phone, first_name, last_name, email, tags")
        .in("phone", phones);

      const existingMap = new Map(
        (existing || []).map((c) => [c.phone, c])
      );

      for (const row of chunk) {
        const ex = existingMap.get(row.phone);

        if (ex) {
          // Update: fill only where empty, merge tags, never overwrite
          const updates: Record<string, unknown> = {};
          if (!ex.first_name && row.first_name) updates.first_name = row.first_name;
          if (!ex.last_name && row.last_name) updates.last_name = row.last_name;
          if (!ex.email && row.email) updates.email = row.email;

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
              console.error("Import update error:", error.message);
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
            tags,
            source: "csv",
          });
          if (error) {
            // Duplicate can happen in race conditions
            if (error.code === "23505") {
              skipped++;
            } else {
              console.error("Import insert error:", error.message);
              skipped++;
            }
            continue;
          }
          imported++;
        }
      }
    }

    return NextResponse.json({ imported, updated, skipped });
  } catch (err) {
    console.error("Import error:", (err as Error).message);
    return NextResponse.json(
      { error: "Import failed" },
      { status: 500 }
    );
  }
}
