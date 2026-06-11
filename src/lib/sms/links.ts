import { randomBytes } from "crypto";

// Generate a short code for link tracking: 8 chars, URL-safe
export function generateShortCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

// URL regex: matches http:// or https:// URLs in message body
const URL_REGEX = /https?:\/\/[^\s]+/gi;

export function extractUrls(body: string): string[] {
  return body.match(URL_REGEX) || [];
}

// Replace all URLs in body with tracked short URLs
export function replaceUrlsWithTracked(
  body: string,
  urlMap: Map<string, string> // original URL -> short URL
): string {
  return body.replace(URL_REGEX, (match) => {
    return urlMap.get(match) || match;
  });
}
