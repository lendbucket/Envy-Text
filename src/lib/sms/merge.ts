// Render merge fields in a campaign body for a specific contact.
// {{first_name}} and {{last_name}} resolve to the contact's values.
// Unresolved fields become empty string so literal braces never appear.

interface MergeContact {
  first_name: string | null;
  last_name: string | null;
}

export function renderMergeFields(body: string, contact: MergeContact): string {
  return body
    .replace(/\{\{first_name\}\}/gi, (contact.first_name || "").trim())
    .replace(/\{\{last_name\}\}/gi, (contact.last_name || "").trim())
    .replace(/\{\{[^}]*\}\}/g, ""); // Strip any remaining unrecognized merge fields
}
