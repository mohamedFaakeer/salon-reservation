"use client";

import type { MonitoringOverview } from "../../lib/api-client";
import { formatPriceCents } from "../../lib/format";

function AttentionCard({
  tone,
  label,
  value,
  sub,
}: {
  tone: "crit" | "high" | "ok";
  label: string;
  value: number;
  sub: string;
}) {
  const toneClass =
    tone === "crit"
      ? "border-red-700 bg-red-950/80 text-red-200"
      : tone === "high"
        ? "border-orange-700 bg-orange-950/80 text-orange-200"
        : "border-slate-700 bg-slate-800 text-white";
  const valueClass = tone === "ok" ? "text-teal-300" : "";
  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-4 ${toneClass}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</span>
      <span className={`text-3xl font-bold tabular leading-none ${valueClass}`}>{value}</span>
      <span className="text-[11px] opacity-80">{sub}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
      <div className="text-xl font-bold tabular text-white">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export function OverviewPanel({ data }: { data: MonitoringOverview }) {
  const criticalOrOpen = data.openErrorCount + data.securityEventCounts.last24h > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Needs your attention</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AttentionCard
            tone={data.securityEventCounts.last24h > 0 ? "crit" : "ok"}
            label="Security events, last 24h"
            value={data.securityEventCounts.last24h}
            sub={data.securityEventCounts.last24h > 0 ? "Check the Security tab" : "Nothing flagged today"}
          />
          <AttentionCard
            tone={data.openErrorCount > 0 ? "high" : "ok"}
            label="Open server errors"
            value={data.openErrorCount}
            sub={data.openErrorCount > 0 ? "Not yet acknowledged or resolved" : "Nothing outstanding"}
          />
          <AttentionCard
            tone={data.tenantsNearQuota > 0 ? "high" : "ok"}
            label="Salons near their limit"
            value={data.tenantsNearQuota}
            sub={data.tenantsNearQuota > 0 ? "Email or SMS usage at 80%+" : "Everyone has headroom"}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Platform activity — this month</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Active salons" value={String(data.activeTenants)} />
          <MetricCard label="Bookings" value={data.bookingsThisMonth.toLocaleString("en-LK")} />
          <MetricCard label="Revenue collected" value={formatPriceCents(data.revenueThisMonthCents)} />
          <MetricCard label="Security events, 7d" value={String(data.securityEventCounts.last7d)} />
        </div>
      </div>

      {!criticalOrOpen ? (
        <p className="text-sm text-slate-400">
          Nothing needs immediate attention. Full history is on the{" "}
          <span className="text-teal-300">Security events</span> and <span className="text-teal-300">Error log</span>{" "}
          tabs.
        </p>
      ) : null}
    </div>
  );
}
