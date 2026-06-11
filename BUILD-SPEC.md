# Envy Texts - Build Specification

Internal two-way text messaging platform for Salon Envy USA. Single-user operator tool behind a password gate. No accounts, no onboarding. You hit the link, enter the password, and you are in the platform.

- Repo: lendbucket/envy-text
- Domain: text.salonenvyusa.com (Vercel)
- Stack: Next.js 15 App Router, TypeScript, Tailwind CSS v3.4, Supabase (Postgres + Storage + Realtime), Twilio (approved A2P account), Vercel (hosting + cron)

This document is the source of truth. Build in the phase order at the bottom. Every phase ships something usable.

## 1. Core Requirements

1. Password gate, no user accounts. One shared password.
2. Two-way texting. Outbound sends and inbound replies land in conversation threads, updating live.
3. Contact import from CSV and Excel, plus manual add and inline edit.
4. Mass text campaigns with audience selection by tag or full list.
5. MMS media upload (images) attached to any message or campaign.
6. Live message preview (phone mockup) with character and segment counter.
7. Test text to the operator's own number before any campaign goes out.
8. Cost estimate shown before every send, with a required confirmation checkbox. Nothing sends without the checkbox.
9. Campaign scheduling (send now or at a future date/time, Central Time).
10. Campaign analytics: delivered, failed, replied, clicked. Never label anything "opened" since SMS has no open tracking.
11. Built to extend. Clean module boundaries so features can be added later without rework.

## 2. Auth: Password Gate

- APP_PASSWORD env var holds the password.
- /login page: single password field. POST to /api/auth/login.
- On correct password, set an httpOnly, secure, sameSite=lax cookie containing an HMAC-signed token (sign with AUTH_SECRET). Expiry 30 days.
- middleware.ts protects every route except /login, /api/auth/login, /api/twilio/inbound, /api/twilio/status, /api/cron/*, and /l/* (link tracker redirects). Invalid or missing cookie redirects to /login.
- Rate limit login attempts (in-memory is fine for v1).
- robots.txt with Disallow: / and a global noindex, nofollow meta tag.

## 3. Database Schema (Supabase)

SQL migrations in /supabase/migrations. Phone numbers always stored in E.164 (+13615551234).

contacts: id uuid pk, phone text unique not null, first_name, last_name, email, tags text[] default '{}', notes, opted_out boolean default false, opted_out_at timestamptz, source text ('csv','manual','inbound'), created_at, updated_at

conversations: id uuid pk, contact_id uuid references contacts unique not null, last_message_at, last_message_preview, unread_count int default 0, created_at

messages: id uuid pk, conversation_id references conversations not null, direction text check in ('inbound','outbound'), body text, media_urls text[] default '{}', status text default 'queued' (queued, sending, sent, delivered, failed, received), twilio_sid, error_code, error_message, campaign_id references campaigns, segments int, estimated_cost numeric(10,5), created_at

campaigns: id uuid pk, name not null, body not null, media_urls text[] default '{}', audience_type text not null ('all','tags'), audience_tags text[] default '{}', recipient_count int default 0, status text default 'draft' (draft, scheduled, sending, sent, cancelled, failed), scheduled_at timestamptz, started_at, completed_at, estimated_cost numeric(10,2), actual_sent int default 0, actual_failed int default 0, created_at

campaign_recipients: id uuid pk, campaign_id references campaigns not null, contact_id references contacts not null, status text default 'pending' (pending, sent, delivered, failed, skipped_opted_out), twilio_sid, error_code, error_message, sent_at, replied_at timestamptz, unique(campaign_id, contact_id)

tracked_links: id uuid pk, campaign_id references campaigns not null, original_url text not null, created_at

tracked_link_codes: id uuid pk, tracked_link_id references tracked_links not null, contact_id references contacts not null, short_code text unique not null, unique(tracked_link_id, contact_id)

link_clicks: id uuid pk, tracked_link_code_id references tracked_link_codes not null, clicked_at timestamptz default now(), user_agent text

settings: key text pk, value jsonb not null. Seed: sms_price_per_segment (0.0079), mms_price (0.02), carrier_fee_per_sms (0.003), carrier_fee_per_mms (0.01), test_phone_number

Indexes on messages(conversation_id, created_at), contacts(phone), campaign_recipients(campaign_id, status), campaigns(status, scheduled_at), tracked_link_codes(short_code).

RLS: enable on all tables, deny all anon access. The app talks to Supabase exclusively through server-side routes with the service role key. Realtime subscriptions are the one client-side read, scoped read-only.

## 4. Twilio Integration

All Twilio calls server-side in lib/twilio/client.ts. Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID (prefer the Messaging Service SID for sends when present).

Outbound: POST /api/messages/send for one-off conversation replies. Create the message row as queued, call Twilio, update to sent with the SID or failed with the error. Pass statusCallback https://text.salonenvyusa.com/api/twilio/status so delivery receipts update rows to delivered or failed with the Twilio error code. The status callback also updates campaign_recipients rows by twilio_sid.

Inbound: POST /api/twilio/inbound.
1. Validate with Twilio signature validation against TWILIO_AUTH_TOKEN and the full URL. Reject failures.
2. Look up contact by From. If none, create one with source 'inbound'.
3. Upsert conversation, insert message with direction inbound, status received, including any MediaUrl0..N.
4. Bump unread_count, last_message_at, last_message_preview.
5. Reply attribution: if this contact has a campaign_recipients row sent within the last 72 hours and replied_at is null, set replied_at now.
6. Respond with empty TwiML so Twilio does not auto-reply.

Opt-outs: if an inbound body is exactly STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT (case-insensitive), set opted_out true on the contact. START or UNSTOP flips it back. Campaign sends always skip opted-out contacts and record skipped_opted_out.

## 5. Cost Estimation (the precaution gate)

Build lib/sms/segments.ts as a pure, unit-tested module:
- Detect encoding: any character outside the GSM-7 basic set makes the message UCS-2.
- GSM-7: 160 chars single segment, 153 per segment multi-part. Extended GSM chars (^ { } \ [ ] ~ | euro sign) count as 2.
- UCS-2: 70 single, 67 per segment multi-part.
- MMS: media presence makes it 1 MMS regardless of body length.

Cost per recipient: (segments x sms_price_per_segment) + (carrier_fee_per_sms x segments) for SMS, or mms_price + carrier_fee_per_mms for MMS. Prices come from the settings table, editable on the Settings page.

Compose screens show live: character count, encoding, segment count, recipient count (opted-out excluded), and total estimated dollar cost with the math written out, e.g. "412 recipients x 2 segments x $0.0109 = $8.98 estimated". A required checkbox reading "I have reviewed the estimated cost of $X.XX and approve this send" gates the Send and Schedule buttons on campaigns. One-off replies show per-message cost inline without the checkbox. After a campaign completes, show actual sent/failed next to the estimate.

## 6. Contacts and Import

Contacts page: searchable, sortable table. Columns: name, phone, tags, opt-out status, last activity. Row click opens an edit side panel. Bulk actions: tag, delete. Tag filter chips.

Import flow (/contacts/import):
1. Drag-and-drop or browse for .csv, .xlsx, .xls. Parse with papaparse (CSV) and xlsx (Excel, first sheet).
2. Column mapping step: auto-detect headers (phone/mobile/cell, first name, last name, email), remappable dropdowns. Phone is the only required mapping.
3. Normalize phones to E.164, assume +1 for 10-digit numbers. Validation summary: valid, invalid (with row numbers), in-file duplicates, already in database.
4. Optional tags applied to the whole import batch (this is how lists get segmented).
5. Commit: upsert on phone in chunks of 500 server-side. Existing contacts get fields filled only where empty, tags merged. Never overwrite a manual edit with import data.
6. Result screen: imported, updated, skipped counts.

## 7. Conversations (Inbox)

Two-pane layout, the heart of the app.
- Left: conversation list sorted by last_message_at with contact name or raw number, preview snippet, relative timestamp, unread badge. Search by name or number. Unread filter toggle.
- Right: message thread. Outbound bubbles right-aligned in the accent color, inbound left-aligned neutral. Day-grouped timestamps. Delivery status under outbound bubbles. MMS images inline with lightbox.
- Composer: textarea with live segment counter, attach-image button, per-message cost hint, send button. Enter to send, Shift+Enter newline.
- Realtime: Supabase Realtime on messages and conversations so inbound texts appear instantly. Opening a thread resets unread.
- Contact details (tags, notes, opt-out) in a collapsible panel at the top of the thread.

## 8. Campaigns (Mass Text)

Campaign list (/campaigns): drafts, scheduled, sending, sent, with recipient counts, estimate vs actual cost, status. Scheduled campaigns cancellable until they start.

Compose (/campaigns/new), three columns on desktop:
1. Message: internal name, body textarea with merge fields {{first_name}} and {{last_name}} (fallback to empty string, never literal braces in a sent text), image attach.
2. Audience: everyone, or one or more tags (OR logic). Live recipient count, "excludes N opted out" shown.
3. Preview and launch: phone mockup with a sample contact's merge fields rendered, cost breakdown, "Send test to my number" button (one real text to test_phone_number from Settings, marked as test, not attached to recipients), the approval checkbox, then Send now or Schedule with a date/time picker (America/Chicago, stored UTC).

Link tracking: if the body contains a URL, automatically replace it at send time with NEXT_PUBLIC_APP_URL/l/[short_code], one unique code per recipient so clicks attribute to a contact. The /l/[code] route logs the click and 302 redirects to the original URL. Public route, excluded from auth middleware. The compose preview notes that the link will be shortened.

Sending engine, queue and cron (never loop a large send in one request):
- Launch snapshots the audience into campaign_recipients and flips the campaign to sending. Scheduled campaigns wait.
- GET /api/cron/process-campaigns runs every minute via vercel.json cron, protected by a CRON_SECRET bearer check. Each run: promote scheduled campaigns whose time arrived, pull the next 100 pending recipients (maxDuration 300 on the route), render merge fields per contact, generate per-recipient short codes if links exist, send via Twilio with the status callback, mark rows sent or failed, mark the campaign sent when no pending rows remain.
- vercel.json: { "crons": [{ "path": "/api/cron/process-campaigns", "schedule": "* * * * *" }] }

## 9. Campaign Analytics

Campaign detail page shows, with counts and percentages: sent, delivered, failed, replied, clicked, plus cost per delivered message. Delivered and failed come from status callbacks on campaign_recipients. Replied comes from replied_at (72-hour inbound attribution). Clicked comes from distinct contacts in link_clicks for the campaign. Failed recipients listed with Twilio error codes so the list can be cleaned, with a one-click "tag all failed as invalid-number" action. Never use the word "opened" anywhere in the UI.

## 10. Media (MMS)

- Supabase Storage bucket mms-media, public read. Upload via a server route, return the public URL, pass as mediaUrl to Twilio.
- Accept jpeg, png, gif. Hard limit 5MB, but compress client-side to under 600KB and max 1600px long edge before upload using browser-image-compression, since several US carriers degrade or reject larger images.
- Image renders in the phone preview exactly as attached. One image per message in v1; media_urls array leaves room for more.

## 11. Design System

Salon Envy property on a Salon Envy subdomain: warm, polished, salon-grade, executed as a focused SaaS workspace. Think Linear's discipline wearing Salon Envy's palette.

- Background: warm off-white #FAF7F2 canvas, pure white #FFFFFF cards and panels. Borders #E8E2D8, 1px, never heavier.
- Text: espresso #1C1410 primary, #6F6258 secondary.
- Accent: one accent for primary buttons, outbound bubbles, active states, unread badge. Deep rose #B0445C as a single Tailwind token named accent so it can be swapped in one line to match the Salon Envy portal.
- Status: delivered #2E7D52, failed #C03434, scheduled #9A6B15. Muted, never neon.
- Type: Inter for all UI. Fraunces only for the "Envy Texts" wordmark in the sidebar and large page titles. Tabular figures for counts and costs.
- Layout: fixed slim sidebar (Conversations, Contacts, Campaigns, Settings) with icon and label, content max-width constrained, 8px spacing grid, rounded-xl cards, shadow-sm only. No gradients, no glassmorphism.
- Signature element: the live cost meter on campaign compose. Large tabular-numeral dollar figure updating as the operator types, segment math written out beneath in plain language. The most important number in the app, designed like it.
- Microcopy: plain, active, confident. "Send to 412 contacts," not "Submit." Empty states say what to do next. Errors say what failed and how to fix it. No exclamation points, no emoji, no em dashes anywhere.
- Keyboard-friendly: visible focus rings, Enter-to-send, / focuses search. Responsive enough to triage the inbox from a phone.

## 12. Settings Page

- Twilio sending number (display only, from env) and Messaging Service status
- Editable pricing: SMS per segment, MMS, carrier fees (writes to settings)
- Test phone number for test sends
- Tag management (rename, delete with reassignment)
- Inbound webhook URL displayed with copy button, plus "last inbound received" timestamp as a health check

## 13. Build Phases

Phase 1 - Skeleton and gate. Next.js 15 scaffold, Tailwind tokens, Supabase migrations, password gate and middleware, app shell with sidebar, Settings page. Init git, create repo lendbucket/envy-text, push. Stop and give exact steps to connect Vercel and point text.salonenvyusa.com at it.

Phase 2 - Contacts. Contacts CRUD, CSV/Excel import end to end with mapping, validation, dedupe, tagging.

Phase 3 - Two-way messaging. Twilio client, inbound webhook with signature validation, status callback, conversations inbox with realtime, one-off send with cost hint. Verify a real round trip after pointing the Twilio webhook at production.

Phase 4 - Campaigns. Segment/cost library with unit tests, campaign compose with preview, test send, cost approval checkbox, audience selection, recipient queue, cron sending engine, link tracking. Send-now first, then scheduling.

Phase 5 - Analytics, media, polish. Campaign analytics page, MMS upload and compression, inline media, opt-out mirroring, empty states, error states, mobile pass.

Later (leave hooks, do not build): message templates, auto-replies and keywords, analytics dashboard across campaigns, multiple sending numbers per location, drip sequences.

## 14. Conventions

- TypeScript strict. Zod-validate every API route input.
- Server routes own all writes; the browser never holds the service role key.
- lib/twilio, lib/sms, lib/supabase as the only integration touchpoints. Pages stay thin.
- Conventional commits, one PR per phase to lendbucket/envy-text.
- Never log full message bodies or phone numbers; log SIDs and IDs.
- No em dashes, no emoji in any copy, code comments included.
