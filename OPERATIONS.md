# Envy Texts - Operations Guide

## Rotating secrets

### APP_PASSWORD
1. Pick a new password.
2. Update it in Vercel: Project Settings > Environment Variables > APP_PASSWORD.
3. Redeploy (push an empty commit or trigger from the Vercel dashboard).
4. The old session cookies remain valid until they expire (30 days). To force logout immediately, also rotate AUTH_SECRET (see below).

### AUTH_SECRET
1. Generate a new value: `openssl rand -base64 32`
2. Update in Vercel environment variables.
3. Redeploy. All existing session cookies become invalid immediately because HMAC verification will fail. Everyone must re-enter the password.

### CRON_SECRET
1. Generate a new value: `openssl rand -base64 32`
2. Update in Vercel environment variables.
3. Redeploy. The Vercel cron calls `/api/cron/process-campaigns` with the bearer token from this variable. No other change needed since Vercel reads it from the environment on each invocation.

### TWILIO_AUTH_TOKEN
1. Rotate the token in the Twilio Console (Account > API Keys & Tokens).
2. Update in Vercel environment variables.
3. Redeploy. Both outbound sends and inbound webhook signature validation use this value. If the old token is still active on Twilio's side during the transition, inbound messages that arrive between the Vercel deploy and Twilio's propagation may fail signature validation and return 403. This window is typically under 60 seconds.

### SUPABASE_SERVICE_ROLE_KEY
1. Regenerate in Supabase: Project Settings > API > service_role > Regenerate.
2. Update in Vercel environment variables.
3. Redeploy. The old key stops working immediately.

---

## Checking cron health

The campaign processing cron runs every minute via Vercel Cron Jobs.

**Verify the cron is running:**
```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://text.salonenvyusa.com/api/cron/process-campaigns
```
Expected response: `{"processed":0}` when idle, or `{"processed":N}` when actively sending.

If the response is `{"processed":0,"reason":"Outside quiet hours..."}`, the cron is running but honoring the 10 AM - 8 PM Central window.

**Check Vercel Cron logs:**
- Vercel dashboard > Project > Cron Jobs tab shows recent executions and their status codes.
- `vercel logs --environment production --since 1h --expand` shows function output.

**If the cron is not firing:**
- Verify `vercel.json` contains the cron definition with schedule `* * * * *`.
- Verify the project is on a Vercel plan that supports cron (Pro or Enterprise). The Hobby plan allows cron but with longer minimum intervals.

---

## Twilio error codes on failed recipients

When a campaign recipient fails, the Twilio error code is stored in `campaign_recipients.error_code`. Common codes:

| Code | Meaning | Action |
|------|---------|--------|
| 30001 | Queue overflow | Retry later. Twilio's queue was full. |
| 30002 | Account suspended | Check your Twilio account status. |
| 30003 | Unreachable destination | The number cannot receive SMS. Tag as invalid-number. |
| 30004 | Message blocked | Carrier blocked the message. May be content or rate related. |
| 30005 | Unknown destination | Number does not exist. Tag as invalid-number. |
| 30006 | Landline or unreachable | Number is a landline. Tag as invalid-number. |
| 30007 | Carrier violation | Carrier rejected for content policy. Review message body. |
| 30008 | Unknown error | Transient. Retry later. |
| 21211 | Invalid 'To' phone number | Phone number is malformed. Tag as invalid-number. |
| 21408 | Permission not enabled | Your Twilio account needs the permission for this region. |
| 21610 | Recipient has opted out via Twilio | Contact sent STOP at the Twilio level. Mark as opted out. |
| 63016 | A2P registration required | Your campaign registration is incomplete in Twilio. |

Full reference: https://www.twilio.com/docs/api/errors

**Cleaning up after failures:**
On the campaign detail page, click "Tag all as invalid-number" to bulk-tag every failed recipient. Then exclude the `invalid-number` tag from future campaigns, or delete those contacts.

---

## Recovering a stuck campaign

A campaign can get stuck in "sending" if the cron fails mid-run (deploy, timeout, or unhandled error). The queue is designed to be resumable: pending recipients are processed in the next cron run.

**Diagnosis:**
1. Go to the campaign detail page. Check how many are Pending vs Sent/Delivered/Failed.
2. If Pending is stuck at a fixed number across multiple cron runs, check the Vercel function logs for errors.

**If the cron is timing out (maxDuration 300s):**
The cron processes 100 recipients per run. A campaign with 10,000 recipients takes roughly 100 cron runs (100 minutes) to complete. Each run sends up to 100 messages. If Twilio latency is high, fewer may complete per run. This is normal; the queue drains over time.

**If the campaign is stuck in "launching":**
This means the launch endpoint crashed between the atomic status transition and the final update to "sending". Fix:
```sql
-- In the Supabase SQL Editor:
update campaigns set status = 'draft' where id = 'CAMPAIGN_ID' and status = 'launching';
```
Then retry the launch from the app.

**Force-completing a campaign:**
If all recipients have been processed but the campaign was never marked "sent" (the cron missed the completion check):
```sql
update campaigns
set status = 'sent',
    completed_at = now(),
    actual_sent = (select count(*) from campaign_recipients where campaign_id = 'CAMPAIGN_ID' and status in ('sent', 'delivered')),
    actual_failed = (select count(*) from campaign_recipients where campaign_id = 'CAMPAIGN_ID' and status = 'failed')
where id = 'CAMPAIGN_ID';
```

**Cancelling a stuck campaign:**
```sql
-- Delete unprocessed recipients and cancel
delete from campaign_recipients where campaign_id = 'CAMPAIGN_ID' and status = 'pending';
update campaigns set status = 'cancelled' where id = 'CAMPAIGN_ID';
```
Already-sent messages are not affected. Recipients who already received the text keep it.
