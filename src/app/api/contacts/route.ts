import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  phone: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  source: z.enum(["csv", "manual", "inbound"]).default("manual"),
});

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const search = url.searchParams.get("search") || "";
  const tags = url.searchParams.get("tags") || "";
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") || "desc";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  try {
    const supabase = createServerClient();
    let query = supabase.from("contacts").select("*", { count: "exact" });

    if (search) {
      query = query.or(
        `phone.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim());
      query = query.overlaps("tags", tagList);
    }

    const validSorts = [
      "created_at",
      "first_name",
      "last_name",
      "phone",
      "updated_at",
    ];
    const sortCol = validSorts.includes(sort) ? sort : "created_at";
    const ascending = order === "asc";

    query = query
      .order(sortCol, { ascending })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      contacts: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("Contacts GET error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to load contacts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contact data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("contacts")
      .insert(parsed.data)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A contact with this phone number already exists" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Contacts POST error:", (err as Error).message);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
