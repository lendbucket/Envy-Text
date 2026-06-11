import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/twilio/inbound",
  "/api/twilio/status",
  "/l/",
  "/robots.txt",
  "/favicon.ico",
  "/_next",
];

const PUBLIC_PREFIXES = ["/api/cron/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  // Exact match for /l/[code]
  if (/^\/l\/[^/]+$/.test(pathname)) {
    return true;
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("envy_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verify token structure and expiry without importing node crypto.
  // Full HMAC verification happens server-side; middleware does a
  // lightweight expiry check to avoid stale cookies hitting pages.
  const parts = token.split(".");
  if (parts.length !== 2) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = parts[0];
  const expiresAt = parseInt(payload.split(":")[1], 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("envy_session");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
