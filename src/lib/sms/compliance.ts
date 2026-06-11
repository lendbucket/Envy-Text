// Quiet hours: 10 AM to 8 PM Central Time (America/Chicago).
//
// TCPA requires 8 AM - 9 PM in the recipient's local time. Our contact
// list spans US time zones (Eastern through Hawaii). Using 10 AM - 8 PM
// Central guarantees we land inside 8 AM - 9 PM for every US time zone:
//   10 AM Central = 11 AM Eastern, 9 AM Mountain, 8 AM Pacific
//    8 PM Central =  9 PM Eastern, 7 PM Mountain, 6 PM Pacific
//
// Later: infer per-contact timezone from area code and allow the full
// 8 AM - 9 PM window per recipient. Until then this conservative window
// keeps every send compliant without per-number lookups.

export const OPT_OUT_SUFFIX = "\nReply STOP to opt out";

export function isWithinQuietHours(): boolean {
  const now = new Date();
  const central = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const hour = central.getHours();
  // Allowed: 10 AM (hour 10) through 7:59 PM (hour 19)
  return hour >= 10 && hour < 20;
}

export function getQuietHoursMessage(): string {
  return (
    "Sends are blocked outside 10 AM to 8 PM Central Time. This window " +
    "keeps every US time zone inside TCPA quiet hours (8 AM - 9 PM local). " +
    "Schedule this campaign for a time within that window."
  );
}

// Returns the body with opt-out text appended if the toggle is on.
// Does not double-append if the text is already present.
export function applyOptOutSuffix(body: string, append: boolean): string {
  if (!append) return body;
  if (body.includes("STOP")) return body;
  return body + OPT_OUT_SUFFIX;
}
