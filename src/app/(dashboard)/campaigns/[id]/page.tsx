"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  body: string;
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
}

export default function CampaignDetailPage() {
  const params = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/campaigns/${params.id}`)
      .then((r) => r.json())
      .then(setCampaign)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-secondary">Loading...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-secondary">Campaign not found.</p>
      </div>
    );
  }

  const stats = campaign.recipient_stats;
  const total = stats.sent + stats.delivered + stats.failed + stats.pending + stats.skipped_opted_out;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0");

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/campaigns"
          className="p-2 text-secondary hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary">
            {campaign.name}
          </h2>
          <p className="text-sm text-secondary mt-1">
            Status: {campaign.status} | {campaign.recipient_count} recipients
          </p>
        </div>
      </div>

      {/* Stats grid -- Phase 5 will expand this into full analytics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-primary tabular-nums">
            {stats.sent + stats.delivered}
          </p>
          <p className="text-xs text-secondary mt-1">Sent ({pct(stats.sent + stats.delivered)}%)</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-delivered tabular-nums">
            {stats.delivered}
          </p>
          <p className="text-xs text-secondary mt-1">Delivered ({pct(stats.delivered)}%)</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-failed tabular-nums">
            {stats.failed}
          </p>
          <p className="text-xs text-secondary mt-1">Failed ({pct(stats.failed)}%)</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-secondary tabular-nums">
            {stats.pending}
          </p>
          <p className="text-xs text-secondary mt-1">Pending ({pct(stats.pending)}%)</p>
        </div>
        <div className="bg-panel rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-semibold text-secondary tabular-nums">
            {stats.skipped_opted_out}
          </p>
          <p className="text-xs text-secondary mt-1">Opted out</p>
        </div>
      </div>

      {/* Message preview */}
      <div className="bg-panel rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">
          Message
        </h3>
        <p className="text-sm text-primary whitespace-pre-wrap">{campaign.body}</p>
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
