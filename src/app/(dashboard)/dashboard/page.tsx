"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CampaignVariance {
  campaignId: string;
  campaignName: string;
  completedAt: string;
  estimatedCost: number;
  actualCost: number;
  variance: number;
  variancePct: number;
}

interface CalibrationData {
  calibrated_sms_rate: number | null;
  calibrated_mms_rate: number | null;
  sample_size: number;
  updated_at: string | null;
  pinned: boolean;
  manual_sms_rate: number;
  manual_mms_rate: number;
  sms_drift_pct: number | null;
  mms_drift_pct: number | null;
  variance_trend: CampaignVariance[];
}

interface DashboardData {
  totalSent: number;
  totalReceived: number;
  deliveredCount: number;
  deliveredRate: number;
  failedCount: number;
  failedRate: number;
  actualSpend: number;
  messageCharges: number;
  carrierFees: number;
  hasUsageData: boolean;
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
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
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

  useEffect(() => {
    fetch("/api/calibration")
      .then((r) => r.json())
      .then(setCalibration)
      .catch(() => {});
  }, []);

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
        <div className="bg-panel rounded-xl border border-border p-4 group relative">
          <p className="text-2xl font-semibold tabular-nums text-primary">
            ${data.hasUsageData ? data.actualSpend.toFixed(2) : data.estimatedSpend.toFixed(2)}
          </p>
          <p className="text-xs text-secondary mt-1">Actual spend</p>
          <p className="text-[10px] text-secondary tabular-nums">
            {data.hasUsageData ? "from Twilio usage records" : "estimated"}
          </p>
          {data.hasUsageData && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-primary text-white text-[10px] px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 tabular-nums">
              <p>Message charges: ${data.messageCharges.toFixed(2)}</p>
              <p>Carrier fees: ${data.carrierFees.toFixed(2)}</p>
              <p className="border-t border-white/20 mt-1 pt-1">Total: ${data.actualSpend.toFixed(2)}</p>
            </div>
          )}
        </div>
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

      {/* Cost calibration panel */}
      {calibration && (
        <div className="bg-panel rounded-xl border border-border p-5 mb-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Cost calibration
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {/* SMS rate */}
            <div>
              <p className="text-xs text-secondary mb-1">SMS per segment</p>
              <p className="text-lg font-semibold text-primary tabular-nums">
                {calibration.calibrated_sms_rate !== null
                  ? `$${calibration.calibrated_sms_rate.toFixed(4)}`
                  : "---"}
              </p>
              <p className="text-[10px] text-secondary tabular-nums">
                Manual: ${calibration.manual_sms_rate.toFixed(4)}
              </p>
              {calibration.sms_drift_pct !== null && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium mt-0.5 ${
                  Math.abs(calibration.sms_drift_pct) < 5 ? "text-delivered" :
                  Math.abs(calibration.sms_drift_pct) < 15 ? "text-scheduled" : "text-failed"
                }`}>
                  {calibration.sms_drift_pct > 0 ? <TrendingUp className="w-3 h-3" /> :
                   calibration.sms_drift_pct < 0 ? <TrendingDown className="w-3 h-3" /> :
                   <Minus className="w-3 h-3" />}
                  {calibration.sms_drift_pct > 0 ? "+" : ""}{calibration.sms_drift_pct.toFixed(1)}% vs manual
                </span>
              )}
            </div>

            {/* MMS rate */}
            <div>
              <p className="text-xs text-secondary mb-1">MMS per message</p>
              <p className="text-lg font-semibold text-primary tabular-nums">
                {calibration.calibrated_mms_rate !== null
                  ? `$${calibration.calibrated_mms_rate.toFixed(4)}`
                  : "---"}
              </p>
              <p className="text-[10px] text-secondary tabular-nums">
                Manual: ${calibration.manual_mms_rate.toFixed(4)}
              </p>
              {calibration.mms_drift_pct !== null && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium mt-0.5 ${
                  Math.abs(calibration.mms_drift_pct) < 5 ? "text-delivered" :
                  Math.abs(calibration.mms_drift_pct) < 15 ? "text-scheduled" : "text-failed"
                }`}>
                  {calibration.mms_drift_pct > 0 ? <TrendingUp className="w-3 h-3" /> :
                   calibration.mms_drift_pct < 0 ? <TrendingDown className="w-3 h-3" /> :
                   <Minus className="w-3 h-3" />}
                  {calibration.mms_drift_pct > 0 ? "+" : ""}{calibration.mms_drift_pct.toFixed(1)}% vs manual
                </span>
              )}
            </div>

            {/* Sample size */}
            <div>
              <p className="text-xs text-secondary mb-1">Sample size</p>
              <p className="text-lg font-semibold text-primary tabular-nums">
                {calibration.sample_size} campaign{calibration.sample_size !== 1 ? "s" : ""}
              </p>
              <p className="text-[10px] text-secondary">
                {calibration.updated_at
                  ? `Updated ${new Date(calibration.updated_at).toLocaleDateString()}`
                  : "Not yet calibrated"}
              </p>
            </div>

            {/* Status */}
            <div>
              <p className="text-xs text-secondary mb-1">Status</p>
              <p className={`text-lg font-semibold ${calibration.pinned ? "text-scheduled" : calibration.sample_size > 0 ? "text-delivered" : "text-secondary"}`}>
                {calibration.pinned ? "Pinned" : calibration.sample_size > 0 ? "Active" : "Pending"}
              </p>
              <p className="text-[10px] text-secondary">
                {calibration.pinned
                  ? "Using manual rates (override)"
                  : calibration.sample_size > 0
                  ? "Using calibrated rates"
                  : "Waiting for campaign data"}
              </p>
            </div>
          </div>

          {/* Estimated vs actual variance trend */}
          {calibration.variance_trend.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-primary mb-3">
                Estimated vs actual cost per campaign
              </p>
              <div className="space-y-1.5">
                {calibration.variance_trend.map((v) => {
                  const maxCost = Math.max(v.estimatedCost, v.actualCost, 0.01);
                  const estW = (v.estimatedCost / maxCost) * 100;
                  const actW = (v.actualCost / maxCost) * 100;
                  return (
                    <div key={v.campaignId} className="group relative">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-secondary w-24 truncate shrink-0" title={v.campaignName}>
                          {v.campaignName}
                        </span>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <div className="h-2 bg-scheduled/30 rounded-full" style={{ width: `${estW}%` }} />
                          <div className="h-2 bg-delivered/50 rounded-full" style={{ width: `${actW}%` }} />
                        </div>
                        <span className={`text-[10px] font-medium tabular-nums w-14 text-right shrink-0 ${
                          Math.abs(v.variancePct) < 10 ? "text-delivered" :
                          Math.abs(v.variancePct) < 25 ? "text-scheduled" : "text-failed"
                        }`}>
                          {v.variancePct > 0 ? "+" : ""}{v.variancePct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-primary text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 tabular-nums">
                        Est: ${v.estimatedCost.toFixed(2)} | Actual: ${v.actualCost.toFixed(2)} | Diff: ${v.variance > 0 ? "+" : ""}{v.variance.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-secondary">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-1.5 bg-scheduled/30 rounded-full" /> Estimated
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-1.5 bg-delivered/50 rounded-full" /> Actual
                </span>
              </div>
            </div>
          )}
        </div>
      )}

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
