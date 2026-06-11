// Quiet hours: 8 AM to 9 PM Central Time (America/Chicago).
// Returns true if sending is allowed right now.

export const OPT_OUT_SUFFIX = "\nReply STOP to opt out";

export function isWithinQuietHours(): boolean {
  const now = new Date();
  // Convert to Central Time
  const central = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const hour = central.getHours();
  // Allowed: 8 AM (hour 8) through 8:59 PM (hour 20)
  return hour >= 8 && hour < 21;
}

export function getQuietHoursMessage(): string {
  return (
    "Sends are blocked outside 8 AM to 9 PM Central Time to comply with " +
    "TCPA quiet hours. Schedule this campaign for a time within that window."
  );
}

// Returns the body with opt-out text appended if the toggle is on.
// Does not double-append if the text is already present.
export function applyOptOutSuffix(body: string, append: boolean): string {
  if (!append) return body;
  if (body.includes("STOP")) return body;
  return body + OPT_OUT_SUFFIX;
}
