"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Clock, FlaskConical, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { analyzeMessage, estimateCost, findNonGsmChars, replaceSmartChars } from "@/lib/sms/segments";
import { OPT_OUT_SUFFIX } from "@/lib/sms/compliance";
import { ImageUpload } from "@/components/image-upload";

interface Pricing {
  sms_price_per_segment: number;
  mms_price: number;
  carrier_fee_per_sms: number;
  carrier_fee_per_mms: number;
}

interface TagInfo {
  tag: string;
  count: number;
}

export default function CampaignComposePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "tags">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
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
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);

  const fetchTags = useCallback(() => {
    fetch("/api/contacts/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
  }, []);

  // Fetch tags and pricing on mount
  useEffect(() => {
    fetchTags();
    fetch("/api/pricing").then((r) => r.json()).then(setPricing).catch(() => {});
  }, [fetchTags]);

  // Refetch tags when page regains focus
  useEffect(() => {
    function handleFocus() {
      fetchTags();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchTags]);

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

  // Non-GSM character detection for "Why this price" breakdown
  const nonGsmChars = useMemo(
    () => (segmentInfo.encoding === "UCS-2" ? findNonGsmChars(effectiveBody) : []),
    [effectiveBody, segmentInfo.encoding]
  );
  const hasReplaceableChars = nonGsmChars.some((c) => c.replaceable);

  // Cost if we were to clean smart chars
  const cleanedBody = useMemo(
    () => (hasReplaceableChars ? replaceSmartChars(effectiveBody) : effectiveBody),
    [effectiveBody, hasReplaceableChars]
  );
  const cleanedSegmentInfo = useMemo(
    () => (hasReplaceableChars ? analyzeMessage(cleanedBody, hasMedia) : segmentInfo),
    [cleanedBody, hasMedia, hasReplaceableChars, segmentInfo]
  );
  const cleanedCost = useMemo(
    () =>
      hasReplaceableChars
        ? estimateCost(cleanedBody, hasMedia, recipientCount, pricing)
        : cost,
    [cleanedBody, hasMedia, recipientCount, pricing, hasReplaceableChars, cost]
  );

  // Check if long text-only SMS would be cheaper as MMS
  const mmsCostPerRecipient = pricing.mms_price + pricing.carrier_fee_per_mms;
  const showMmsHint = !hasMedia && segmentInfo.segmentCount > 1 &&
    cost.costPerRecipient > mmsCostPerRecipient;

  function handleReplaceSmartChars() {
    const cleaned = replaceSmartChars(body);
    setBody(cleaned);
  }

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
                    allTags.map((t) => (
                      <button
                        key={t.tag}
                        onClick={() => toggleTag(t.tag)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                          selectedTags.includes(t.tag)
                            ? "bg-accent text-white border-accent"
                            : "bg-panel text-secondary border-border hover:border-accent/40"
                        }`}
                      >
                        {t.tag} ({t.count.toLocaleString()})
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

            {/* Why this price toggle */}
            {effectiveBody.length > 0 && (
              <button
                onClick={() => setShowPriceBreakdown(!showPriceBreakdown)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover mt-2 transition-colors focus:outline-none"
              >
                {showPriceBreakdown ? "Hide breakdown" : "Why this price"}
                {showPriceBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            {showPriceBreakdown && effectiveBody.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-3 text-xs">
                {hasMedia ? (
                  <div className="text-secondary">
                    <p>MMS is a flat rate per message regardless of body length.</p>
                    <p className="tabular-nums mt-1">
                      Message fee: ${pricing.mms_price.toFixed(4)} + carrier fee: ${pricing.carrier_fee_per_mms.toFixed(4)} = ${mmsCostPerRecipient.toFixed(4)} per recipient
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Character and segment details */}
                    <div className="text-secondary space-y-1">
                      <p>
                        {segmentInfo.charCount} characters, {segmentInfo.encoding} encoding, {segmentInfo.segmentCount} segment{segmentInfo.segmentCount !== 1 ? "s" : ""}
                      </p>
                      {segmentInfo.encoding === "GSM-7" ? (
                        <p>
                          GSM-7: {segmentInfo.charCount <= 160 ? "up to 160 chars per single segment" : "153 chars per segment in multipart"}
                        </p>
                      ) : (
                        <p>
                          UCS-2 (Unicode): {segmentInfo.charCount <= 70 ? "up to 70 chars per single segment" : "67 chars per segment in multipart"}
                        </p>
                      )}
                      <p className="tabular-nums">
                        Per recipient: {segmentInfo.segmentCount} x (${pricing.sms_price_per_segment.toFixed(4)} + ${pricing.carrier_fee_per_sms.toFixed(4)}) = ${cost.costPerRecipient.toFixed(4)}
                      </p>
                    </div>

                    {/* Non-GSM characters */}
                    {segmentInfo.encoding === "UCS-2" && nonGsmChars.length > 0 && (
                      <div className="bg-scheduled/10 border border-scheduled/20 rounded-lg p-3">
                        <p className="text-primary font-medium mb-1.5">
                          Unicode characters detected ({nonGsmChars.length})
                        </p>
                        <p className="text-secondary mb-2">
                          These characters force UCS-2 encoding, which halves the characters per segment and increases cost.
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {nonGsmChars.slice(0, 20).map((c, i) => (
                            <span
                              key={i}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono ${
                                c.replaceable
                                  ? "bg-scheduled/20 text-scheduled"
                                  : "bg-failed/10 text-failed"
                              }`}
                              title={c.name}
                            >
                              &ldquo;{c.char}&rdquo; {c.name}
                            </span>
                          ))}
                          {nonGsmChars.length > 20 && (
                            <span className="text-secondary">and {nonGsmChars.length - 20} more</span>
                          )}
                        </div>

                        {hasReplaceableChars && (
                          <div className="border-t border-scheduled/20 pt-2 mt-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-secondary">
                                After replacement: {cleanedSegmentInfo.encoding}, {cleanedSegmentInfo.segmentCount} segment{cleanedSegmentInfo.segmentCount !== 1 ? "s" : ""}
                              </span>
                              {cleanedCost.totalCost < cost.totalCost && (
                                <span className="text-delivered font-medium tabular-nums">
                                  Save ${(cost.totalCost - cleanedCost.totalCost).toFixed(2)}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={handleReplaceSmartChars}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                              <Zap className="w-3 h-3" />
                              Replace with SMS-safe characters
                            </button>
                            {nonGsmChars.some((c) => !c.replaceable) && (
                              <p className="text-failed mt-1.5">
                                {nonGsmChars.filter((c) => !c.replaceable).length} character{nonGsmChars.filter((c) => !c.replaceable).length !== 1 ? "s have" : " has"} no substitute and must be removed manually.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* MMS hint for long text-only messages */}
                    {showMmsHint && (
                      <div className="bg-accent-tint border border-accent/20 rounded-lg p-3">
                        <p className="text-primary font-medium mb-1">Tip: MMS would be cheaper</p>
                        <p className="text-secondary tabular-nums">
                          SMS: ${cost.costPerRecipient.toFixed(4)}/recipient ({segmentInfo.segmentCount} segments) vs MMS: ${mmsCostPerRecipient.toFixed(4)}/recipient (flat rate). Attach an image to send as MMS and save ${((cost.costPerRecipient - mmsCostPerRecipient) * recipientCount).toFixed(2)} total.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
