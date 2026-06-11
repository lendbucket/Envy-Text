import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createToken, COOKIE_NAME } from "@/lib/auth/token";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { timingSafeEqual } from "crypto";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 }
    );
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  // Timing-safe password comparison
  const provided = Buffer.from(parsed.data.password);
  const expected = Buffer.from(appPassword);
  const match =
    provided.length === expected.length &&
    timingSafeEqual(provided, expected);

  if (!match) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401 }
    );
  }

  const { token, maxAge } = createToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });

  return response;
}
