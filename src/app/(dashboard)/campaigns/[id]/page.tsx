"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tag, AlertTriangle, Download, Users, RefreshCw } from "lucide-react";
import { formatPhone } from "@/lib/phone";

const ERROR_EXPLANATIONS: Record<string, string> = {
  "21610": "Recipient opted out (STOP)",
  "21611": "Source number not valid for this destination",
  "21612": "Recipient is unreachable",
  "21614": "Invalid mobile number",
  "30001": "Queue overflow",
  "30003": "Unreachable handset",
  "30004": "Message blocked by carrier",
  "30005": "Unknown destination handset",
  "30006": "Landline or unreachable carrier",
  "30007": "Carrier violation",
  "30034": "Message blocked by Twilio for A2P compliance",
};

interface FailedRecipient {
  id: string;
  contact_id: string;
  error_code: string | null;
  error_message: string | null;
  contact: {
    phone: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface Campaign {
  id: string;
  name: string;
  body: string;
  media_urls: string[];
  status: string;
  recipient_count: number;
  estimated_cost: number | null;
  actual_sent: number;
  actual_failed: number;
  actual_cost_total: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  first_sent_at: string | null;
  audience_type: string;
  audience_tags: string[];
  append_opt_out: boolean;
  created_at: string;
  recipient_stats: {
    pending: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped_opted_out: number;
  };
  replied_count: number;
  clicked_count: number;
  cost_per_delivered: number;
  error_breakdown: { code: string; count: number }[];
  click_timeline: { clicked_at: string; contact_name: string; url: string }[];
  replies: { contact_id: string; replied_at: string; contact: { phone: string; first_name: string | null; last_name: string | null } | null }[];
  opt_outs: { contact_id: string; contact: { phone: string; first_name: string | null; last_name: string | null } | null }[];
  audience_groups: { clicked: number; replied: number; engaged: number; no_response: number };
  failed_recipients: FailedRecipient[];
}

export default function CampaignDetailPage() {
  const params = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [tagResult, setTagResult] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState("");
  const [showLookupConfirm, setShowLookupConfirm] = useState(false);
  const [lookupEstimate, setLookupEstimate] = useState("");

  // Reconcile state
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState("");

  // Audience builder state
  const [audienceGroups, setAudienceGroups] = useState<Set<string>>(new Set());
  const [audienceTag, setAudienceTag] = useState("");
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceResult, setAudienceResult] = useState("");

  function fetchCampaign() {
    if (!params.id) return;
    fetch(`/api/campaigns/${params.id}`)
      .then((r) => r.json())
      .then(setCampaign)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchCampaign();
    const interval = setInterval(() => {
      if (campaign?.status === "sending") fetchCampaign();
    }, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, campaign?.status]);

  async function handleTagFailed() {
    if (!campaign) return;
    setTagging(true);
    setTagResult("");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/tag-failed`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTagResult(`Tagged ${data.tagged} contact${data.tagged !== 1 ? "s" : ""} as "invalid-number"`);
      } else {
        setTagResult(data.error || "Failed to tag contacts");
      }
    } catch {
      setTagResult("Failed to tag contacts");
    } finally {
      setTagging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-secondary">Loading campaign...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-secondary text-sm">Campaign not found.</p>
          <Link href="/campaigns" className="text-accent text-sm mt-2 inline-block hover:underline">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  const stats = campaign.recipient_stats;
  const totalSendable = stats.sent + stats.delivered + stats.failed;
  const pct = (n: number) => (totalSendable > 0 ? ((n / totalSendable) * 100).toFixed(1) : "0");

  function contactDisplay(c: { phone: string; first_name: string | null; last_name: string | null } | null) {
    if (!c) return "Unknown";
    const name = `${c.first_name || ""} ${c.last_name || ""}`.trim();
    return name || formatPhone(c.phone);
  }

  return (
    <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/campaigns"
          className="p-2 text-secondary hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-primary truncate">
            {campaign.name}
          </h2>
          <p className="text-sm text-secondary mt-1">
            {campaign.status === "sending" ? "Sending now" : campaign.status} | {campaign.recipient_count} recipients
          </p>
        </div>
        {/* Refresh from Twilio */}
        {["sent", "sending"].includes(campaign.status) && (
          <button
            onClick={async () => {
              setReconciling(true);
              setReconcileResult("");
              try {
                const res = await fetch(`/api/campaigns/${campaign.id}/reconcile`, { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setReconcileResult(
                    `Checked ${data.checked}, updated ${data.updated} (${data.delivered} delivered, ${data.failed} failed)`
                  );
                  fetchCampaign();
                } else {
                  setReconcileResult(data.error || "Reconciliation failed");
                }
              } catch {
                setReconcileResult("Reconciliation failed");
              } finally {
                setReconciling(false);
              }
            }}
            disabled={reconciling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 shrink-0"
            title="Fetch real statuses from Twilio for any rows stuck as sent"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Syncing..." : "Refresh from Twilio"}
          </button>
        )}
      </div>

      {reconcileResult && (
        <div className="mb-6 p-3 bg-delivered/10 border border-delivered/20 rounded-xl text-sm text-delivered">
          {reconcileResult}
        </div>
      )}

      {/* Analytics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-primary tabular-nums">
            {stats.sent + stats.delivered}
          </p>
          <p className="text-xs text-secondary mt-1">Sent</p>
          <p className="text-[10px] text-secondary tabular-nums">{pct(stats.sent + stats.delivered)}%</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-delivered tabular-nums">
            {stats.delivered}
          </p>
          <p className="text-xs text-secondary mt-1">Delivered</p>
          <p className="text-[10px] text-secondary tabular-nums">{pct(stats.delivered)}%</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-failed tabular-nums">
            {stats.failed}
          </p>
          <p className="text-xs text-secondary mt-1">Failed</p>
          <p className="text-[10px] text-secondary tabular-nums">{pct(stats.failed)}%</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-accent tabular-nums">
            {campaign.replied_count}
          </p>
          <p className="text-xs text-secondary mt-1">Replied</p>
          <p className="text-[10px] text-secondary tabular-nums">{pct(campaign.replied_count)}%</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-accent tabular-nums">
            {campaign.clicked_count}
          </p>
          <p className="text-xs text-secondary mt-1">Clicked</p>
          <p className="text-[10px] text-secondary tabular-nums">{pct(campaign.clicked_count)}%</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-primary tabular-nums">
            ${campaign.cost_per_delivered.toFixed(4)}
          </p>
          <p className="text-xs text-secondary mt-1">Cost/delivered</p>
        </div>
      </div>

      {/* Delivery funnel */}
      <div className="bg-panel rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
          Delivery funnel
        </h3>
        <div className="space-y-3">
          <FunnelBar label="Queued" count={campaign.recipient_count} max={campaign.recipient_count} color="bg-secondary/30" />
          <FunnelBar label="Sent" count={stats.sent + stats.delivered} max={campaign.recipient_count} color="bg-accent/50" />
          <FunnelBar label="Delivered" count={stats.delivered} max={campaign.recipient_count} color="bg-delivered" />
          {stats.failed > 0 && (
            <FunnelBar label="Failed" count={stats.failed} max={campaign.recipient_count} color="bg-failed" />
          )}
        </div>
        {campaign.first_sent_at && campaign.completed_at && (
          <p className="text-xs text-secondary mt-3">
            Send duration: {formatDuration(new Date(campaign.first_sent_at), new Date(campaign.completed_at))}
          </p>
        )}
      </div>

      {/* Sending progress */}
      {campaign.status === "sending" && stats.pending > 0 && (
        <div className="bg-accent-tint border border-accent/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-accent font-medium">
            Sending in progress: {stats.pending} remaining
          </p>
          <div className="w-full bg-canvas rounded-full h-2 mt-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${totalSendable > 0 ? ((totalSendable / (totalSendable + stats.pending)) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Cost: estimated vs actual */}
      <div className="bg-panel rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
          Cost
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-secondary">Estimated</p>
            <p className="text-primary font-medium tabular-nums">
              ${(campaign.estimated_cost || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-secondary">Actual (Twilio)</p>
            <p className="text-primary font-medium tabular-nums">
              {campaign.actual_cost_total > 0
                ? `$${campaign.actual_cost_total.toFixed(2)}`
                : "Pending"}
            </p>
          </div>
          <div>
            <p className="text-secondary">Variance</p>
            <p className="text-primary font-medium tabular-nums">
              {campaign.actual_cost_total > 0
                ? `$${((campaign.estimated_cost || 0) - campaign.actual_cost_total).toFixed(2)}`
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-secondary">Sent / failed</p>
            <p className="text-primary font-medium tabular-nums">
              {campaign.actual_sent} sent, {campaign.actual_failed} failed
            </p>
          </div>
        </div>
      </div>

      {/* Failure breakdown by error code */}
      {campaign.error_breakdown && campaign.error_breakdown.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Failure breakdown
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs font-medium text-secondary">Code</th>
                <th className="text-left py-2 text-xs font-medium text-secondary">Count</th>
                <th className="text-left py-2 text-xs font-medium text-secondary">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {campaign.error_breakdown.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-b-0">
                  <td className="py-2 text-failed font-mono text-xs">{row.code}</td>
                  <td className="py-2 text-primary tabular-nums">{row.count}</td>
                  <td className="py-2 text-secondary text-xs">
                    {ERROR_EXPLANATIONS[row.code] || "Check Twilio error reference"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Failed recipients */}
      {campaign.failed_recipients.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-failed" />
              Failed recipients ({campaign.failed_recipients.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const ids = campaign.failed_recipients.map((r) => r.contact_id);
                  setLookupLoading(true);
                  try {
                    const res = await fetch("/api/contacts/lookup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ contact_ids: ids, confirmed: false }),
                    });
                    const data = await res.json();
                    setLookupEstimate(data.message);
                    setShowLookupConfirm(true);
                  } catch {
                    setLookupResult("Failed to get estimate.");
                  } finally {
                    setLookupLoading(false);
                  }
                }}
                disabled={lookupLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {lookupLoading ? "Checking..." : "Check line types"}
              </button>
              <button
                onClick={handleTagFailed}
                disabled={tagging}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <Tag className="w-3 h-3" />
                {tagging ? "Tagging..." : "Tag all as invalid-number"}
              </button>
            </div>
          </div>

          {tagResult && (
            <p className="text-xs text-delivered mb-3">{tagResult}</p>
          )}

          {lookupResult && (
            <p className="text-xs text-delivered mb-3">{lookupResult}</p>
          )}

          {showLookupConfirm && (
            <div className="mb-4 p-3 bg-accent-tint border border-accent/20 rounded-lg">
              <p className="text-xs text-primary mb-2">{lookupEstimate}</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const ids = campaign.failed_recipients.map((r) => r.contact_id);
                    setLookupLoading(true);
                    try {
                      const res = await fetch("/api/contacts/lookup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contact_ids: ids, confirmed: true }),
                      });
                      const data = await res.json();
                      setLookupResult(data.message || "Lookup complete.");
                      setShowLookupConfirm(false);
                    } catch {
                      setLookupResult("Lookup failed.");
                    } finally {
                      setLookupLoading(false);
                    }
                  }}
                  disabled={lookupLoading}
                  className="px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                >
                  {lookupLoading ? "Running..." : "Confirm"}
                </button>
                <button
                  onClick={() => setShowLookupConfirm(false)}
                  className="px-3 py-1 text-xs border border-border rounded-lg text-secondary hover:text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-medium text-secondary">Contact</th>
                  <th className="text-left py-2 text-xs font-medium text-secondary">Phone</th>
                  <th className="text-left py-2 text-xs font-medium text-secondary">Error code</th>
                  <th className="text-left py-2 text-xs font-medium text-secondary">Error</th>
                </tr>
              </thead>
              <tbody>
                {campaign.failed_recipients.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 text-primary">{contactDisplay(r.contact)}</td>
                    <td className="py-2 text-secondary tabular-nums">
                      {r.contact ? formatPhone(r.contact.phone) : "N/A"}
                    </td>
                    <td className="py-2 text-failed font-mono text-xs">
                      {r.error_code || "N/A"}
                    </td>
                    <td className="py-2 text-secondary text-xs truncate max-w-[200px]">
                      {r.error_message || "No details"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Click timeline */}
      {campaign.click_timeline && campaign.click_timeline.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Click timeline
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs font-medium text-secondary">When</th>
                  <th className="text-left py-2 text-xs font-medium text-secondary">Contact</th>
                  <th className="text-left py-2 text-xs font-medium text-secondary">Link</th>
                </tr>
              </thead>
              <tbody>
                {campaign.click_timeline.map((click, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-2 text-secondary text-xs tabular-nums">
                      {new Date(click.clicked_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-primary text-xs">{click.contact_name}</td>
                    <td className="py-2 text-accent text-xs truncate max-w-[200px]">
                      <a href={click.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {click.url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reply list */}
      {campaign.replies && campaign.replies.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Replies ({campaign.replies.length})
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {campaign.replies.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-border last:border-b-0 pb-2">
                <Link
                  href="/conversations"
                  className="text-accent text-xs hover:underline"
                >
                  {contactDisplay(r.contact)}
                </Link>
                <span className="text-xs text-secondary tabular-nums">
                  {new Date(r.replied_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opt-outs from this campaign */}
      {campaign.opt_outs && campaign.opt_outs.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Opt-outs from this campaign ({campaign.opt_outs.length})
          </h3>
          <div className="space-y-2">
            {campaign.opt_outs.map((r, i) => (
              <p key={i} className="text-sm text-primary">
                {contactDisplay(r.contact)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Create audience */}
      {campaign.audience_groups && (campaign.status === "sent" || campaign.status === "sending") && (
        <CreateAudienceSection
          campaign={campaign}
          audienceGroups={audienceGroups}
          setAudienceGroups={setAudienceGroups}
          audienceTag={audienceTag}
          setAudienceTag={setAudienceTag}
          audienceLoading={audienceLoading}
          setAudienceLoading={setAudienceLoading}
          audienceResult={audienceResult}
          setAudienceResult={setAudienceResult}
        />
      )}

      {/* Message preview */}
      <div className="bg-panel rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
          Message
        </h3>
        <p className="text-sm text-primary whitespace-pre-wrap">{campaign.body}</p>
        {campaign.media_urls && campaign.media_urls.length > 0 && (
          <div className="mt-3 flex gap-2">
            {campaign.media_urls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt="Campaign media"
                className="w-24 h-24 object-cover rounded-lg border border-border cursor-pointer"
                onClick={() => window.open(url, "_blank")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-panel rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
          Timeline
        </h3>
        <div className="space-y-2 text-sm text-secondary">
          <p>Created: {new Date(campaign.created_at).toLocaleString()}</p>
          {campaign.scheduled_at && (
            <p>
              Scheduled: {new Date(campaign.scheduled_at).toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })} CT
            </p>
          )}
          {campaign.started_at && (
            <p>Started: {new Date(campaign.started_at).toLocaleString()}</p>
          )}
          {campaign.completed_at && (
            <p>Completed: {new Date(campaign.completed_at).toLocaleString()}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const AUDIENCE_GROUP_LABELS: Record<string, string> = {
  clicked: "Clicked",
  replied: "Replied",
  engaged: "Engaged (clicked or replied)",
  no_response: "No response",
};

function CreateAudienceSection({
  campaign,
  audienceGroups,
  setAudienceGroups,
  audienceTag,
  setAudienceTag,
  audienceLoading,
  setAudienceLoading,
  audienceResult,
  setAudienceResult,
}: {
  campaign: Campaign;
  audienceGroups: Set<string>;
  setAudienceGroups: (s: Set<string>) => void;
  audienceTag: string;
  setAudienceTag: (s: string) => void;
  audienceLoading: boolean;
  setAudienceLoading: (b: boolean) => void;
  audienceResult: string;
  setAudienceResult: (s: string) => void;
}) {
  const groups = campaign.audience_groups;
  const groupKeys = ["clicked", "replied", "engaged", "no_response"] as const;

  function toggleGroup(key: string) {
    const next = new Set(audienceGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setAudienceGroups(next);
  }

  // Compute total contacts for selected groups (deduplicated via engaged logic)
  function selectedCount(): number {
    const selected = Array.from(audienceGroups);
    if (selected.length === 0) return 0;
    // If "engaged" is selected, it includes clicked+replied deduplicated
    // If both "clicked" and "replied" are selected without "engaged", still deduplicate
    let total = 0;
    const hasEngaged = selected.includes("engaged");
    const hasClicked = selected.includes("clicked");
    const hasReplied = selected.includes("replied");
    const hasNoResponse = selected.includes("no_response");

    if (hasEngaged || (hasClicked && hasReplied)) {
      total += groups.engaged;
    } else if (hasClicked) {
      total += groups.clicked;
    } else if (hasReplied) {
      total += groups.replied;
    }

    if (hasNoResponse) {
      total += groups.no_response;
    }

    return total;
  }

  const slug = campaign.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const defaultTag = audienceGroups.size === 1
    ? `${slug}-${Array.from(audienceGroups)[0].replace("_", "-")}s`
    : `${slug}-audience`;

  const effectiveTag = audienceTag || defaultTag;
  const count = selectedCount();

  async function handleTag() {
    if (count === 0 || !effectiveTag) return;
    setAudienceLoading(true);
    setAudienceResult("");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/audience`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: Array.from(audienceGroups),
          tag: effectiveTag,
          action: "tag",
        }),
      });
      const data = await res.json();
      setAudienceResult(data.message || "Tagging complete.");
    } catch {
      setAudienceResult("Tagging failed.");
    } finally {
      setAudienceLoading(false);
    }
  }

  async function handleExport() {
    if (count === 0) return;
    setAudienceLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/audience`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: Array.from(audienceGroups),
          tag: effectiveTag,
          action: "export",
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${effectiveTag}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAudienceResult("Export failed.");
    } finally {
      setAudienceLoading(false);
    }
  }

  return (
    <div className="bg-panel rounded-xl border border-border p-6 mb-6">
      <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Create audience from results
      </h3>

      {/* Group checkboxes */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {groupKeys.map((key) => {
          const groupCount = groups[key];
          return (
            <label
              key={key}
              className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                audienceGroups.has(key)
                  ? "border-accent bg-accent-tint"
                  : "border-border hover:border-accent/30"
              }`}
            >
              <input
                type="checkbox"
                checked={audienceGroups.has(key)}
                onChange={() => toggleGroup(key)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
              />
              <span className="text-sm text-primary">
                {AUDIENCE_GROUP_LABELS[key]}
              </span>
              <span className="text-xs text-secondary tabular-nums ml-auto">
                {groupCount.toLocaleString()}
              </span>
            </label>
          );
        })}
      </div>

      {/* Tag input */}
      {audienceGroups.size > 0 && (
        <div className="space-y-3">
          <div>
            <label htmlFor="audience-tag" className="block text-sm font-medium text-primary mb-1">
              Tag name
            </label>
            <input
              id="audience-tag"
              type="text"
              value={audienceTag}
              onChange={(e) => setAudienceTag(e.target.value)}
              placeholder={defaultTag}
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <p className="text-xs text-secondary tabular-nums">
            {count.toLocaleString()} contact{count !== 1 ? "s" : ""} will be tagged &quot;{effectiveTag}&quot;
          </p>

          {audienceResult && (
            <p className="text-xs text-delivered">{audienceResult}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTag}
              disabled={audienceLoading || count === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
            >
              <Tag className="w-3.5 h-3.5" />
              {audienceLoading ? "Applying..." : "Apply tag"}
            </button>
            <button
              onClick={handleExport}
              disabled={audienceLoading || count === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <Download className="w-3.5 h-3.5" />
              Export group as CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-secondary w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-canvas rounded-full h-4 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, minWidth: count > 0 ? "4px" : 0 }}
        />
      </div>
      <span className="text-xs text-primary tabular-nums w-16 text-right">{count.toLocaleString()}</span>
    </div>
  );
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
