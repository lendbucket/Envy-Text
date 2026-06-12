import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/twilio/client";
import { reconcileStaleRows } from "@/lib/twilio/reconcile";
import { renderMergeFields } from "@/lib/sms/merge";
import { applyOptOutSuffix, isWithinQuietHours } from "@/lib/sms/compliance";
import { extractUrls, generateShortCode, replaceUrlsWithTracked } from "@/lib/sms/links";
import { analyzeMessage } from "@/lib/sms/segments";

export const maxDuration = 300;

const BATCH_SIZE = 100;

function verifyBearerToken(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!header || !secret) return false;
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyBearerToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWithinQuietHours()) {
    return NextResponse.json({
      processed: 0,
      reason: "Outside quiet hours (10 AM - 8 PM Central). Skipping.",
    });
  }

  try {
    const supabase = createServerClient();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://text.salonenvyusa.com").replace(/\/$/, "");

    // Step 1: Promote scheduled campaigns whose time has arrived
    const now = new Date().toISOString();
    const { data: scheduledCampaigns } = await supabase
      .from("campaigns")
      .select("id, body, audience_type, audience_tags, append_opt_out")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    for (const camp of scheduledCampaigns || []) {
      // Snapshot audience into campaign_recipients with pagination
      const eligible: { id: string }[] = [];
      const PAGE = 1000;
      let pageOffset = 0;
      let moreContacts = true;

      while (moreContacts) {
        let contactQuery = supabase
          .from("contacts")
          .select("id")
          .eq("opted_out", false)
          .range(pageOffset, pageOffset + PAGE - 1);

        if (camp.audience_type === "tags" && camp.audience_tags?.length > 0) {
          contactQuery = contactQuery.overlaps("tags", camp.audience_tags);
        }

        const { data: batch } = await contactQuery;
        if (batch && batch.length > 0) {
          eligible.push(...batch);
          pageOffset += PAGE;
          if (batch.length < PAGE) moreContacts = false;
        } else {
          moreContacts = false;
        }
      }

      const rows = eligible.map((c) => ({
        campaign_id: camp.id,
        contact_id: c.id,
        status: "pending",
      }));

      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("campaign_recipients").insert(rows.slice(i, i + 500));
      }

      const finalBody = applyOptOutSuffix(camp.body, camp.append_opt_out !== false);

      await supabase
        .from("campaigns")
        .update({
          status: "sending",
          body: finalBody,
          recipient_count: eligible.length,
          started_at: new Date().toISOString(),
        })
        .eq("id", camp.id);

      console.log(`[cron] Promoted scheduled campaign ${camp.id}, ${eligible.length} recipients`);
    }

    // Step 2: Process pending recipients from sending campaigns
    const { data: sendingCampaigns } = await supabase
      .from("campaigns")
      .select("id, body, media_urls, append_opt_out")
      .eq("status", "sending");

    let totalProcessed = 0;

    for (const campaign of sendingCampaigns || []) {
      // Get next batch of pending recipients with contact info
      const { data: pendingRecipients } = await supabase
        .from("campaign_recipients")
        .select("id, contact_id, contacts(id, phone, first_name, last_name, opted_out)")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .limit(BATCH_SIZE);

      if (!pendingRecipients || pendingRecipients.length === 0) {
        // No more pending: mark campaign as sent
        const { count: stillPending } = await supabase
          .from("campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");

        if ((stillPending || 0) === 0) {
          // Count actuals
          const { count: sentCount } = await supabase
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .in("status", ["sent", "delivered"]);

          const { count: failedCount } = await supabase
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .eq("status", "failed");

          await supabase
            .from("campaigns")
            .update({
              status: "sent",
              completed_at: new Date().toISOString(),
              actual_sent: sentCount || 0,
              actual_failed: failedCount || 0,
            })
            .eq("id", campaign.id);

          console.log(`[cron] Campaign ${campaign.id} completed: ${sentCount} sent, ${failedCount} failed`);
        }
        continue;
      }

      // Extract URLs from campaign body for link tracking
      const urls = extractUrls(campaign.body);
      let trackedLinkMap = new Map<string, string>(); // tracked_link.id -> original_url

      if (urls.length > 0) {
        // Create tracked_links rows for each unique URL (if not already created)
        for (const url of [...new Set(urls)]) {
          const { data: existing } = await supabase
            .from("tracked_links")
            .select("id")
            .eq("campaign_id", campaign.id)
            .eq("original_url", url)
            .single();

          if (existing) {
            trackedLinkMap.set(existing.id, url);
          } else {
            const { data: newLink } = await supabase
              .from("tracked_links")
              .insert({ campaign_id: campaign.id, original_url: url })
              .select("id")
              .single();
            if (newLink) trackedLinkMap.set(newLink.id, url);
          }
        }
      }

      const hasMedia = campaign.media_urls && campaign.media_urls.length > 0;

      for (const recipient of pendingRecipients) {
        const contact = recipient.contacts as unknown as {
          id: string;
          phone: string;
          first_name: string | null;
          last_name: string | null;
          opted_out: boolean;
        } | null;

        if (!contact || contact.opted_out) {
          await supabase
            .from("campaign_recipients")
            .update({ status: "skipped_opted_out" })
            .eq("id", recipient.id);
          continue;
        }

        // Render merge fields
        let body = renderMergeFields(campaign.body, contact);

        // Generate per-recipient tracked links
        if (trackedLinkMap.size > 0) {
          const urlReplacements = new Map<string, string>();

          for (const [trackedLinkId, originalUrl] of trackedLinkMap) {
            // Check if code already exists for this link+contact
            let { data: existingCode } = await supabase
              .from("tracked_link_codes")
              .select("short_code")
              .eq("tracked_link_id", trackedLinkId)
              .eq("contact_id", contact.id)
              .single();

            let shortCode: string;
            if (existingCode) {
              shortCode = existingCode.short_code;
            } else {
              shortCode = generateShortCode();
              await supabase.from("tracked_link_codes").insert({
                tracked_link_id: trackedLinkId,
                contact_id: contact.id,
                short_code: shortCode,
              });
            }

            urlReplacements.set(originalUrl, `${appUrl}/l/${shortCode}`);
          }

          body = replaceUrlsWithTracked(body, urlReplacements);
        }

        // Calculate segments for cost tracking
        const segmentInfo = analyzeMessage(body, !!hasMedia);

        try {
          const result = await sendMessage({
            to: contact.phone,
            body,
            mediaUrls: hasMedia ? campaign.media_urls : undefined,
            statusCallback: `${appUrl}/api/twilio/status`,
          });

          await supabase
            .from("campaign_recipients")
            .update({
              status: "sent",
              twilio_sid: result.sid,
              sent_at: new Date().toISOString(),
            })
            .eq("id", recipient.id);

          totalProcessed++;
        } catch (err) {
          const errMsg = (err as Error).message;
          const errorCode = (err as { code?: number }).code?.toString() || "";

          await supabase
            .from("campaign_recipients")
            .update({
              status: "failed",
              error_code: errorCode,
              error_message: errMsg,
              sent_at: new Date().toISOString(),
            })
            .eq("id", recipient.id);

          console.error(`[cron] Send failed for recipient ${recipient.id}, error code: ${errorCode}`);
          totalProcessed++;
        }
      }
    }

    // Step 3: Reconcile stale "sent" rows -- fetch real status from Twilio
    // for any campaign_recipients stuck in "sent" with a twilio_sid.
    // This self-heals missed status callbacks (e.g. from signature rejections).
    const reconcile = await reconcileStaleRows(supabase, 30);

    return NextResponse.json({
      processed: totalProcessed,
      reconciled: reconcile.updated,
      reconciled_checked: reconcile.checked,
    });
  } catch (err) {
    console.error("[cron] Unhandled error:", (err as Error).message);
    return NextResponse.json({ error: "Cron processing failed" }, { status: 500 });
  }
}
