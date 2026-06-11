import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isWithinQuietHours, getQuietHoursMessage, applyOptOutSuffix } from "@/lib/sms/compliance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Quiet hours enforcement on launch
  if (!isWithinQuietHours()) {
    return NextResponse.json(
      { error: getQuietHoursMessage() },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();

    // Get the campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot launch a campaign with status "${campaign.status}"` },
        { status: 400 }
      );
    }

    // Build audience query
    let contactQuery = supabase
      .from("contacts")
      .select("id, opted_out")
      .eq("opted_out", false);

    if (campaign.audience_type === "tags" && campaign.audience_tags?.length > 0) {
      contactQuery = contactQuery.overlaps("tags", campaign.audience_tags);
    }

    const { data: contacts, error: contactErr } = await contactQuery;
    if (contactErr) throw contactErr;

    const eligibleContacts = (contacts || []).filter((c) => !c.opted_out);

    // Snapshot audience into campaign_recipients
    const recipientRows = eligibleContacts.map((c) => ({
      campaign_id: id,
      contact_id: c.id,
      status: "pending",
    }));

    // Also find opted-out contacts for the count
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

    // Insert skipped rows for opted-out contacts
    if (optedOutCount > 0) {
      let optedOutQuery = supabase
        .from("contacts")
        .select("id")
        .eq("opted_out", true);
      if (campaign.audience_type === "tags" && campaign.audience_tags?.length > 0) {
        optedOutQuery = optedOutQuery.overlaps("tags", campaign.audience_tags);
      }
      const { data: optedOut } = await optedOutQuery;
      if (optedOut) {
        const skippedRows = optedOut.map((c) => ({
          campaign_id: id,
          contact_id: c.id,
          status: "skipped_opted_out",
        }));
        if (skippedRows.length > 0) {
          // Insert in chunks of 500
          for (let i = 0; i < skippedRows.length; i += 500) {
            await supabase.from("campaign_recipients").insert(skippedRows.slice(i, i + 500));
          }
        }
      }
    }

    // Insert pending recipients in chunks
    for (let i = 0; i < recipientRows.length; i += 500) {
      const { error: insertErr } = await supabase
        .from("campaign_recipients")
        .insert(recipientRows.slice(i, i + 500));
      if (insertErr) throw insertErr;
    }

    // Apply opt-out suffix to the stored body if toggled on
    const finalBody = applyOptOutSuffix(campaign.body, campaign.append_opt_out !== false);

    // Update campaign status to sending
    const { error: updateErr } = await supabase
      .from("campaigns")
      .update({
        status: "sending",
        body: finalBody,
        recipient_count: eligibleContacts.length,
        started_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      ok: true,
      recipients: eligibleContacts.length,
      skipped_opted_out: optedOutCount,
    });
  } catch (err) {
    console.error("Campaign launch error:", (err as Error).message);
    return NextResponse.json({ error: "Failed to launch campaign" }, { status: 500 });
  }
}
