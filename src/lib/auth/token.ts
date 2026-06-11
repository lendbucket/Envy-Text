import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "envy_session";
const EXPIRY_DAYS = 30;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createToken(): { token: string; maxAge: number } {
  const expiresAt = Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payload = `envy:${expiresAt}`;
  const signature = sign(payload);
  const token = `${payload}.${signature}`;
  const maxAge = EXPIRY_DAYS * 24 * 60 * 60;
  return { token, maxAge };
}

export function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, providedSig] = parts;
  const expectedSig = sign(payload);

  // Timing-safe comparison
  try {
    const a = Buffer.from(providedSig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  // Check expiry
  const expiresAt = parseInt(payload.split(":")[1], 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

  return true;
}

export { COOKIE_NAME };
