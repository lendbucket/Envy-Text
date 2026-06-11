"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, X as XIcon } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  recipient_count: number;
  estimated_cost: number | null;
  actual_sent: number;
  actual_failed: number;
  scheduled_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-secondary bg-canvas",
  scheduled: "text-scheduled bg-scheduled/10",
  sending: "text-accent bg-accent/10",
  sent: "text-delivered bg-delivered/10",
  cancelled: "text-secondary bg-canvas",
  failed: "text-failed bg-failed/10",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this campaign?")) return;
    const res = await fetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
    if (res.ok) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c))
      );
    }
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary">
            Campaigns
          </h2>
          <p className="text-sm text-secondary mt-1">
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          New campaign
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-secondary text-center py-12">Loading...</p>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-secondary text-sm mb-4">
            No campaigns yet. Create one to send a message to your contacts.
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            New campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-panel rounded-xl border border-border p-5 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="text-sm font-semibold text-primary hover:text-accent transition-colors truncate"
                  >
                    {campaign.name}
                  </Link>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      STATUS_COLORS[campaign.status] || STATUS_COLORS.draft
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-secondary">
                  <span className="tabular-nums">
                    {campaign.recipient_count} recipient{campaign.recipient_count !== 1 ? "s" : ""}
                  </span>
                  {campaign.estimated_cost != null && (
                    <span className="tabular-nums">
                      Est. ${campaign.estimated_cost.toFixed(2)}
                    </span>
                  )}
                  {campaign.status === "sent" && (
                    <span className="tabular-nums">
                      {campaign.actual_sent} sent, {campaign.actual_failed} failed
                    </span>
                  )}
                  {campaign.scheduled_at && campaign.status === "scheduled" && (
                    <span>
                      Scheduled: {new Date(campaign.scheduled_at).toLocaleString("en-US", {
                        timeZone: "America/Chicago",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })} CT
                    </span>
                  )}
                  <span>
                    Created {new Date(campaign.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                {["draft", "scheduled"].includes(campaign.status) && (
                  <button
                    onClick={() => handleCancel(campaign.id)}
                    className="p-1.5 text-secondary hover:text-failed transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-failed/30"
                    title="Cancel campaign"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
