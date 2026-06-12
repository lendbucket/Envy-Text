"use client";

import { useState, useEffect } from "react";

interface DashboardData {
  totalSent: number;
  totalReceived: number;
  deliveredCount: number;
  deliveredRate: number;
  failedCount: number;
  failedRate: number;
  actualSpend: number;
  estimatedSpend: number;
  optOutCount: number;
  optOutRate: number;
  replyCount: number;
  replyRate: number;
  clickCount: number;
  clickThroughRate: number;
  messagesOverTime: { date: string; outbound: number; inbound: number }[];
  spendOverTime: { date: string; amount: number }[];
  errorBreakdown: { code: string; count: number }[];
}

const ERROR_EXPLANATIONS: Record<string, string> = {
  "21610": "Recipient opted out (STOP)",
  "21611": "Source number not valid for this destination",
  "21612": "Recipient is unreachable",
  "21614": "Invalid mobile number",
  "21408": "Account cannot send to this region",
  "30001": "Queue overflow",
  "30002": "Account suspended",
  "30003": "Unreachable handset",
  "30004": "Message blocked by carrier",
  "30005": "Unknown destination handset",
  "30006": "Landline or unreachable carrier",
  "30007": "Carrier violation",
  "30008": "Unknown error",
  "30034": "Message blocked by Twilio for A2P compliance",
};

const RANGE_OPTIONS = [
  { label: "All time", value: 0 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = days > 0 ? `?days=${days}` : "";
    fetch(`/api/dashboard${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-secondary">Loading dashboard...</p>
      </div>
    );
  }

  const maxMsg = Math.max(
    ...data.messagesOverTime.map((d) => d.outbound + d.inbound),
    1
  );
  const maxSpend = Math.max(
    ...data.spendOverTime.map((d) => d.amount),
    0.01
  );

  return (
    <div className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold text-primary">
          Dashboard
        </h2>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                days === opt.value
                  ? "bg-accent-tint text-accent border-accent/30"
                  : "border-border text-secondary hover:text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard label="Messages sent" value={data.totalSent.toLocaleString()} />
        <KpiCard label="Received" value={data.totalReceived.toLocaleString()} />
        <KpiCard
          label="Delivered rate"
          value={`${data.deliveredRate.toFixed(1)}%`}
          sub={`${data.deliveredCount.toLocaleString()} delivered`}
        />
        <KpiCard
          label="Failed rate"
          value={`${data.failedRate.toFixed(1)}%`}
          sub={`${data.failedCount.toLocaleString()} failed`}
          warn={data.failedRate > 5}
        />
        <KpiCard
          label="Actual spend"
          value={`$${data.actualSpend > 0 ? data.actualSpend.toFixed(2) : data.estimatedSpend.toFixed(2)}`}
          sub={data.actualSpend > 0 ? "from Twilio prices" : "estimated"}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <KpiCard
          label="Opt-outs"
          value={data.optOutCount.toLocaleString()}
          sub={`${data.optOutRate.toFixed(1)}% of contacts`}
        />
        <KpiCard
          label="Reply rate"
          value={`${data.replyRate.toFixed(1)}%`}
          sub={`${data.replyCount.toLocaleString()} replies`}
        />
        <KpiCard
          label="Link clicks"
          value={data.clickCount.toLocaleString()}
          sub={`${data.clickThroughRate.toFixed(1)}% CTR`}
        />
        <KpiCard
          label="Est. vs actual"
          value={data.actualSpend > 0 ? `$${(data.estimatedSpend - data.actualSpend).toFixed(2)}` : "N/A"}
          sub={data.actualSpend > 0 ? "estimate variance" : "no actual data yet"}
        />
      </div>

      {/* Messages over time chart */}
      {data.messagesOverTime.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Messages over time
          </h3>
          <div className="flex items-end gap-px h-40">
            {data.messagesOverTime.map((d) => {
              const outH = (d.outbound / maxMsg) * 100;
              const inH = (d.inbound / maxMsg) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center justify-end gap-px group relative"
                >
                  <div
                    className="w-full bg-accent rounded-t"
                    style={{ height: `${outH}%`, minHeight: d.outbound > 0 ? "2px" : 0 }}
                  />
                  <div
                    className="w-full bg-secondary/30 rounded-t"
                    style={{ height: `${inH}%`, minHeight: d.inbound > 0 ? "2px" : 0 }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {d.date}: {d.outbound} out, {d.inbound} in
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-accent rounded" /> Outbound
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-secondary/30 rounded" /> Inbound
            </span>
          </div>
        </div>
      )}

      {/* Spend over time chart */}
      {data.spendOverTime.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Spend over time
          </h3>
          <div className="flex items-end gap-px h-32">
            {data.spendOverTime.map((d) => {
              const h = (d.amount / maxSpend) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center justify-end group relative"
                >
                  <div
                    className="w-full bg-accent/60 rounded-t"
                    style={{ height: `${h}%`, minHeight: d.amount > 0 ? "2px" : 0 }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {d.date}: ${d.amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failure breakdown */}
      {data.errorBreakdown.length > 0 && (
        <div className="bg-panel rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Failure breakdown by error code
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
              {data.errorBreakdown.map((row) => (
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
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-panel rounded-xl border border-border p-4">
      <p className={`text-2xl font-semibold tabular-nums ${warn ? "text-failed" : "text-primary"}`}>
        {value}
      </p>
      <p className="text-xs text-secondary mt-1">{label}</p>
      {sub && <p className="text-[10px] text-secondary tabular-nums">{sub}</p>}
    </div>
  );
}
