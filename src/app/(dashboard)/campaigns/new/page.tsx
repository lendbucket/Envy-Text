"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Clock, FlaskConical } from "lucide-react";
import { analyzeMessage, estimateCost } from "@/lib/sms/segments";
import { OPT_OUT_SUFFIX } from "@/lib/sms/compliance";
import { ImageUpload } from "@/components/image-upload";

interface Pricing {
  sms_price_per_segment: number;
  mms_price: number;
  carrier_fee_per_sms: number;
  carrier_fee_per_mms: number;
}

export default function CampaignComposePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "tags">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [appendOptOut, setAppendOptOut] = useState(true);
  const [approved, setApproved] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [pricing, setPricing] = useState<Pricing>({
    sms_price_per_segment: 0.0079,
    mms_price: 0.02,
    carrier_fee_per_sms: 0.003,
    carrier_fee_per_mms: 0.01,
  });
  const [recipientCount, setRecipientCount] = useState(0);
  const [optedOutCount, setOptedOutCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  // Fetch tags and pricing on mount
  useEffect(() => {
    fetch("/api/contacts/tags").then((r) => r.json()).then((d) => setAllTags(d.tags || [])).catch(() => {});
    fetch("/api/pricing").then((r) => r.json()).then(setPricing).catch(() => {});
  }, []);

  // Fetch recipient count when audience changes using server-side counts
  useEffect(() => {
    const params = new URLSearchParams();
    if (audienceType === "tags" && selectedTags.length > 0) {
      params.set("tags", selectedTags.join(","));
    }
    fetch(`/api/contacts/count?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRecipientCount(data.active || 0);
        setOptedOutCount(data.opted_out || 0);
      })
      .catch(() => {});
  }, [audienceType, selectedTags]);

  // Compute the effective body including opt-out suffix
  const effectiveBody = useMemo(() => {
    if (!appendOptOut || body.includes("STOP")) return body;
    return body + OPT_OUT_SUFFIX;
  }, [body, appendOptOut]);

  // Segment and cost analysis on the effective body
  const hasMedia = !!mediaUrl;
  const segmentInfo = useMemo(() => analyzeMessage(effectiveBody, hasMedia), [effectiveBody, hasMedia]);
  const cost = useMemo(
    () => estimateCost(effectiveBody, hasMedia, recipientCount, pricing),
    [effectiveBody, hasMedia, recipientCount, pricing]
  );

  // Sample preview with merge fields
  const previewBody = useMemo(() => {
    return effectiveBody
      .replace(/\{\{first_name\}\}/gi, "Jane")
      .replace(/\{\{last_name\}\}/gi, "Doe")
      .replace(/\{\{[^}]*\}\}/g, "");
  }, [effectiveBody]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleTestSend(campaignId: string) {
    setTestSending(true);
    setTestResult("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test-send`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTestResult("Test sent to your phone.");
      } else {
        setTestResult(data.error || "Test send failed.");
      }
    } catch {
      setTestResult("Test send failed. Check your connection.");
    } finally {
      setTestSending(false);
    }
  }

  async function handleSubmit(action: "send" | "schedule") {
    setError("");

    if (!name.trim()) { setError("Campaign name is required."); return; }
    if (!body.trim() && !mediaUrl) { setError("Message body or an image is required."); return; }
    if (audienceType === "tags" && selectedTags.length === 0) {
      setError("Select at least one tag for the audience.");
      return;
    }
    if (recipientCount === 0) {
      setError("No eligible recipients for this audience.");
      return;
    }
    if (!approved) {
      setError("Check the cost approval box before sending.");
      return;
    }

    let scheduledAt: string | null = null;
    if (action === "schedule") {
      if (!scheduleDate || !scheduleTime) {
        setError("Pick a date and time to schedule.");
        return;
      }
      // Parse as Central Time and convert to UTC
      const centralStr = `${scheduleDate}T${scheduleTime}:00`;
      const centralDate = new Date(centralStr + "-06:00"); // CDT offset (approximate)
      if (centralDate <= new Date()) {
        setError("Schedule time must be in the future.");
        return;
      }
      scheduledAt = centralDate.toISOString();
    }

    setSaving(true);

    try {
      // Step 1: Create the campaign
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          body: body.trim(),
          media_urls: mediaUrl ? [mediaUrl] : [],
          audience_type: audienceType,
          audience_tags: audienceType === "tags" ? selectedTags : [],
          scheduled_at: scheduledAt,
          estimated_cost: cost.totalCost,
          recipient_count: recipientCount,
          append_opt_out: appendOptOut,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || "Failed to create campaign");
      }

      const campaign = await createRes.json();

      if (action === "schedule") {
        // Campaign was created with status "scheduled" by the API
        // (because scheduled_at was provided). The cron will pick it up.
        router.push(`/campaigns/${campaign.id}`);
        return;
      }

      // Step 2: Launch immediately
      const launchRes = await fetch(`/api/campaigns/${campaign.id}/launch`, {
        method: "POST",
      });

      if (!launchRes.ok) {
        const data = await launchRes.json();
        throw new Error(data.error || "Failed to launch campaign");
      }

      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push("/campaigns")}
          className="p-2 text-secondary hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-display text-2xl font-semibold text-primary">
          New campaign
        </h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-failed/10 border border-failed/20 rounded-xl text-sm text-failed">
          {error}
        </div>
      )}

      {testResult && (
        <div className="mb-6 p-4 bg-delivered/10 border border-delivered/20 rounded-xl text-sm text-delivered">
          {testResult}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Message */}
        <div className="space-y-4">
          <div className="bg-panel rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
              Message
            </h3>

            <div className="space-y-3">
              <div>
                <label htmlFor="camp-name" className="block text-sm font-medium text-primary mb-1">
                  Campaign name (internal only)
                </label>
                <input
                  id="camp-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. June promo, Appointment reminder"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="camp-body" className="block text-sm font-medium text-primary mb-1">
                  Message body
                </label>
                <textarea
                  id="camp-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder={"Hi {{first_name}}, ..."}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm resize-none placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-3 text-xs text-secondary tabular-nums">
                    <span>{segmentInfo.charCount} chars</span>
                    <span>{hasMedia ? "MMS" : segmentInfo.encoding}</span>
                    <span>
                      {hasMedia
                        ? "1 message"
                        : `${segmentInfo.segmentCount} segment${segmentInfo.segmentCount !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-secondary mt-1">
                  Use {"{{first_name}}"} and {"{{last_name}}"} for merge fields. Any URLs will be shortened for click tracking.
                </p>
              </div>

              {/* Image attach */}
              <div className="pt-1">
                {mediaUrl ? (
                  <ImageUpload
                    currentUrl={mediaUrl}
                    onUploaded={setMediaUrl}
                    onRemove={() => setMediaUrl(null)}
                  />
                ) : (
                  <ImageUpload onUploaded={setMediaUrl} />
                )}
              </div>

              {/* Opt-out toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="append-opt-out"
                  type="checkbox"
                  checked={appendOptOut}
                  onChange={(e) => setAppendOptOut(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                />
                <label htmlFor="append-opt-out" className="text-sm text-primary">
                  Append &quot;Reply STOP to opt out&quot;
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Audience */}
        <div className="space-y-4">
          <div className="bg-panel rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
              Audience
            </h3>

            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => { setAudienceType("all"); setSelectedTags([]); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    audienceType === "all"
                      ? "bg-accent text-white border-accent"
                      : "border-border text-secondary hover:text-primary"
                  }`}
                >
                  Everyone
                </button>
                <button
                  onClick={() => setAudienceType("tags")}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                    audienceType === "tags"
                      ? "bg-accent text-white border-accent"
                      : "border-border text-secondary hover:text-primary"
                  }`}
                >
                  By tags
                </button>
              </div>

              {audienceType === "tags" && (
                <div className="flex flex-wrap gap-2">
                  {allTags.length === 0 ? (
                    <p className="text-xs text-secondary">
                      No tags found. Tag your contacts first.
                    </p>
                  ) : (
                    allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                          selectedTags.includes(tag)
                            ? "bg-accent text-white border-accent"
                            : "bg-panel text-secondary border-border hover:border-accent/40"
                        }`}
                      >
                        {tag}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <p className="text-sm text-primary font-medium tabular-nums">
                  {recipientCount.toLocaleString()} recipient{recipientCount !== 1 ? "s" : ""}
                </p>
                {optedOutCount > 0 && (
                  <p className="text-xs text-secondary">
                    Excludes {optedOutCount} opted out
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Preview and launch */}
        <div className="space-y-4">
          {/* Phone preview */}
          <div className="bg-panel rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
              Preview
            </h3>

            <div className="bg-canvas rounded-xl border border-border p-4 max-w-[280px] mx-auto">
              <div className="bg-accent rounded-xl px-3.5 py-2 text-white text-sm whitespace-pre-wrap break-words">
                {mediaUrl && (
                  <img
                    src={mediaUrl}
                    alt="Campaign media"
                    className="w-full rounded-lg mb-1.5"
                  />
                )}
                {previewBody || "Start typing your message..."}
              </div>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="bg-panel rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
              Cost estimate
            </h3>

            <p className="text-3xl font-semibold text-primary tabular-nums">
              ${cost.totalCost.toFixed(2)}
            </p>
            <p className="text-xs text-secondary mt-1 tabular-nums">
              {hasMedia
                ? `${recipientCount.toLocaleString()} recipients x $${cost.costPerRecipient.toFixed(4)} MMS = $${cost.totalCost.toFixed(2)} estimated`
                : `${recipientCount.toLocaleString()} recipients x ${segmentInfo.segmentCount} segment${segmentInfo.segmentCount !== 1 ? "s" : ""} x $${cost.costPerRecipient.toFixed(4)} = $${cost.totalCost.toFixed(2)} estimated`}
            </p>
          </div>

          {/* Test send */}
          <button
            onClick={async () => {
              // Quick-create a draft to test
              setTestResult("");
              setTestSending(true);
              try {
                const res = await fetch("/api/campaigns", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: name.trim() || "Test draft",
                    body: body.trim(),
                    media_urls: mediaUrl ? [mediaUrl] : [],
                    audience_type: audienceType,
                    audience_tags: audienceType === "tags" ? selectedTags : [],
                    append_opt_out: appendOptOut,
                  }),
                });
                if (!res.ok) throw new Error("Failed to create draft");
                const campaign = await res.json();
                await handleTestSend(campaign.id);
              } catch {
                setTestResult("Failed to send test.");
              } finally {
                setTestSending(false);
              }
            }}
            disabled={(!body.trim() && !mediaUrl) || testSending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-border rounded-lg text-secondary hover:text-primary hover:border-primary/20 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <FlaskConical className="w-4 h-4" />
            {testSending ? "Sending test..." : "Send test to my number"}
          </button>

          {/* Approval checkbox */}
          <div className="flex items-start gap-2">
            <input
              id="approve-cost"
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30 mt-0.5"
            />
            <label htmlFor="approve-cost" className="text-sm text-primary">
              I have reviewed the estimated cost of ${cost.totalCost.toFixed(2)} and approve this send
            </label>
          </div>

          {/* Send / Schedule */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setScheduleMode("now")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  scheduleMode === "now"
                    ? "bg-accent-tint text-accent border-accent/30"
                    : "border-border text-secondary"
                }`}
              >
                Send now
              </button>
              <button
                onClick={() => setScheduleMode("schedule")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                  scheduleMode === "schedule"
                    ? "bg-accent-tint text-accent border-accent/30"
                    : "border-border text-secondary"
                }`}
              >
                Schedule
              </button>
            </div>

            {scheduleMode === "schedule" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <p className="col-span-2 text-xs text-secondary">
                  Times are in Central Time (America/Chicago)
                </p>
              </div>
            )}

            <button
              onClick={() => handleSubmit(scheduleMode === "schedule" ? "schedule" : "send")}
              disabled={saving || !approved || (!body.trim() && !mediaUrl) || !name.trim() || recipientCount === 0}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
            >
              {scheduleMode === "schedule" ? (
                <>
                  <Clock className="w-4 h-4" />
                  {saving ? "Scheduling..." : `Schedule for ${recipientCount.toLocaleString()} contacts`}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {saving ? "Launching..." : `Send to ${recipientCount.toLocaleString()} contacts`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
