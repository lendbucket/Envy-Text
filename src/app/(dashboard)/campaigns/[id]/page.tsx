"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tag, AlertTriangle } from "lucide-react";
import { formatPhone } from "@/lib/phone";

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
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
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
  failed_recipients: FailedRecipient[];
}

export default function CampaignDetailPage() {
  const params = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [tagResult, setTagResult] = useState("");

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
    // Poll every 10s if still sending
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
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-primary truncate">
            {campaign.name}
          </h2>
          <p className="text-sm text-secondary mt-1">
            {campaign.status === "sending" ? "Sending now" : campaign.status} | {campaign.recipient_count} recipients
          </p>
        </div>
      </div>

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

      {/* Sending progress */}
      {campaign.status === "sending" && stats.pending > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-6">
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

      {/* Failed recipients */}
      {campaign.failed_recipients.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-failed" />
              Failed recipients ({campaign.failed_recipients.length})
            </h3>
            <button
              onClick={handleTagFailed}
              disabled={tagging}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <Tag className="w-3 h-3" />
              {tagging ? "Tagging..." : "Tag all as invalid-number"}
            </button>
          </div>

          {tagResult && (
            <p className="text-xs text-delivered mb-3">{tagResult}</p>
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
                    <td className="py-2 text-primary">
                      {r.contact
                        ? `${r.contact.first_name || ""} ${r.contact.last_name || ""}`.trim() || "Unknown"
                        : "Unknown"}
                    </td>
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

      {/* Cost summary */}
      <div className="bg-panel rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
          Cost
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-secondary">Estimated</p>
            <p className="text-primary font-medium tabular-nums">
              ${(campaign.estimated_cost || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-secondary">Actual sent / failed</p>
            <p className="text-primary font-medium tabular-nums">
              {campaign.actual_sent} sent, {campaign.actual_failed} failed
            </p>
          </div>
        </div>
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
