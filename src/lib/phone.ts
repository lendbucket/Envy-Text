// Normalize a phone number to E.164 format.
// Assumes US (+1) for 10-digit numbers.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");

  // Already E.164 with +1
  if (/^\+1\d{10}$/.test(digits)) return digits;

  // Has + but not +1 with 10 digits -- could be international
  if (digits.startsWith("+") && digits.length >= 11) return digits;

  // Strip leading +
  const clean = digits.replace(/^\+/, "");

  // 11 digits starting with 1 (US with country code, no +)
  if (/^1\d{10}$/.test(clean)) return `+${clean}`;

  // 10 digits (US without country code)
  if (/^\d{10}$/.test(clean)) return `+1${clean}`;

  return null;
}

// Format E.164 for display: +12125551234 -> (212) 555-1234
export function formatPhone(e164: string): string {
  if (!e164 || !e164.startsWith("+1") || e164.length !== 12) return e164;
  const area = e164.slice(2, 5);
  const prefix = e164.slice(5, 8);
  const line = e164.slice(8, 12);
  return `(${area}) ${prefix}-${line}`;
}
