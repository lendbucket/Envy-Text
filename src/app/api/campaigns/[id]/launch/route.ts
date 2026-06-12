import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isWithinQuietHours, getQuietHoursMessage, applyOptOutSuffix } from "@/lib/sms/compliance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isWithinQuietHours()) {
    return NextResponse.json(
      { error: getQuietHoursMessage() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    // Atomic status transition: only succeed if status is still "draft".
    // This prevents double-submit from creating duplicate recipient queues.
    const { data: updated, error: updateErr } = await supabase
      .from("campaigns")
      .update({ status: "launching" })
      .eq("id", id)
      .eq("status", "draft")
      .select()
      .single();

    if (updateErr || !updated) {
      // Either not found or status was not "draft" (already launched)
      const { data: existing } = await supabase
        .from("campaigns")
        .select("status")
        .eq("id", id)
        .single();

      if (!existing) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      return NextResponse.json(
        { error: `Cannot launch: campaign is already "${existing.status}"` },
        { status: 409 }
      );
    }

    const campaign = updated;

    // Build audience query with pagination to bypass Supabase 1000-row default
    const eligibleContacts: { id: string }[] = [];
    const BATCH = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let contactQuery = supabase
        .from("contacts")
        .select("id")
        .eq("opted_out", false)
        .range(offset, offset + BATCH - 1);

      if (campaign.audience_type === "tags" && campaign.audience_tags?.length > 0) {
        contactQuery = contactQuery.overlaps("tags", campaign.audience_tags);
      }

      const { data: batch, error: contactErr } = await contactQuery;
      if (contactErr) throw contactErr;

      if (batch && batch.length > 0) {
        eligibleContacts.push(...batch);
        offset += BATCH;
        if (batch.length < BATCH) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // Snapshot audience into campaign_recipients
    const recipientRows = eligibleContacts.map((c) => ({
      campaign_id: id,
      contact_id: c.id,
      status: "pending",
    }));

    // Insert opted-out contacts as skipped
    let optedOutCount = 0;
    if (campaign.audience_type === "all") {
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", true);
      optedOutCount = count || 0;
    } else if (campaign.audience_tags?.length > 0) {
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("opted_out", true)
        .overlaps("tags", campaign.audience_tags);
      optedOutCount = count || 0;
    }

    if (optedOutCount > 0) {
      let ooOffset = 0;
      let ooHasMore = true;
      while (ooHasMore) {
        let optedOutQuery = supabase
          .from("contacts")
          .select("id")
          .eq("opted_out", true)
          .range(ooOffset, ooOffset + BATCH - 1);
        if (campaign.audience_type === "tags" && campaign.audience_tags?.length > 0) {
          optedOutQuery = optedOutQuery.overlaps("tags", campaign.audience_tags);
        }
        const { data: optedOut } = await optedOutQuery;
        if (optedOut && optedOut.length > 0) {
          const skippedRows = optedOut.map((c) => ({
            campaign_id: id,
            contact_id: c.id,
            status: "skipped_opted_out",
          }));
          for (let i = 0; i < skippedRows.length; i += 500) {
            await supabase.from("campaign_recipients").insert(skippedRows.slice(i, i + 500));
          }
          ooOffset += BATCH;
          if (optedOut.length < BATCH) ooHasMore = false;
        } else {
          ooHasMore = false;
        }
      }
    }

    console.log(`[launch] Campaign ${id}: ${eligibleContacts.length} eligible, ${optedOutCount} opted out`);

    // Insert pending recipients in chunks
    for (let i = 0; i < recipientRows.length; i += 500) {
      const { error: insertErr } = await supabase
        .from("campaign_recipients")
        .insert(recipientRows.slice(i, i + 500));
      if (insertErr) throw insertErr;
    }

    // Apply opt-out suffix and transition to sending
    const finalBody = applyOptOutSuffix(campaign.body, campaign.append_opt_out !== false);

    await supabase
      .from("campaigns")
      .update({
        status: "sending",
        body: finalBody,
        recipient_count: eligibleContacts.length,
        started_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      recipients: eligibleContacts.length,
      skipped_opted_out: optedOutCount,
    });
  } catch (err) {
    // On failure, revert to draft so the operator can retry
    const supabase = createServerClient();
    await supabase
      .from("campaigns")
      .update({ status: "draft" })
      .eq("id", id)
      .eq("status", "launching");

    console.error("[launch] error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to launch campaign" }, { status: 500 });
  }
}
