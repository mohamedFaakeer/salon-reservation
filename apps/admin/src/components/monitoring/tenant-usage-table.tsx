"use client";

import type { MonitoringTenantUsage } from "../../lib/api-client";
import { formatDate, formatPriceCents } from "../../lib/format";

function UsageBar({ sent, limit }: { sent: number; limit: number }) {
  const percent = limit > 0 ? Math.min(Math.round((sent / limit) * 100), 100) : 0;
  const color = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-400" : "bg-teal-400";
  const figClass = percent >= 100 ? "text-red-400 font-semibold" : percent >= 80 ? "text-amber-400 font-semibold" : "text-slate-400";
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-900">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className={`text-[11px] tabular ${figClass}`}>
        {sent.toLocaleString("en-LK")} / {limit.toLocaleString("en-LK")} · {percent}%
      </span>
    </div>
  );
}

/** "Today, 9:14 AM" / "3 days ago" — a stale login is itself a signal, so age is styled, not just stated. */
function lastLoginDisplay(iso: string | null): { text: string; className: string } {
  if (!iso) {
    return { text: "Never", className: "text-slate-500" };
  }
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  const text =
    days <= 0
      ? `Today, ${new Date(iso).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}`
      : days === 1
        ? "Yesterday"
        : `${days} days ago`;
  const className = days >= 14 ? "text-red-400" : days >= 3 ? "text-amber-400" : "text-slate-300";
  return { text, className };
}

export function TenantUsageTable({ rows }: { rows: MonitoringTenantUsage[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-slate-700">
            {["Salon", "Bookings", "Revenue", "Email usage", "SMS usage", "Last staff login", "Locked"].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const login = lastLoginDisplay(row.lastStaffLoginAt);
            return (
              <tr key={row.tenantId} data-testid={`monitoring-tenant-${row.slug}`} className="border-b border-slate-700/60 last:border-b-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{row.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">/salon/{row.slug}</p>
                </td>
                <td className="px-4 py-3 text-sm tabular text-slate-200">{row.bookingsThisMonth.toLocaleString("en-LK")}</td>
                <td className="px-4 py-3 text-sm tabular text-slate-200">{formatPriceCents(row.revenueThisMonthCents)}</td>
                <td className="px-4 py-3">
                  <UsageBar sent={row.emailUsage.sent} limit={row.emailUsage.limit} />
                </td>
                <td className="px-4 py-3">
                  <UsageBar sent={row.smsUsage.sent} limit={row.smsUsage.limit} />
                </td>
                <td className={`px-4 py-3 text-sm tabular ${login.className}`}>
                  {login.text}
                  {row.lastStaffLoginAt ? (
                    <p className="mt-0.5 text-[10px] text-slate-600">{formatDate(row.lastStaffLoginAt)}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm tabular">
                  {row.lockedAccountCount > 0 ? (
                    <span className="rounded bg-red-500/15 px-2 py-0.5 font-semibold text-red-400">
                      {row.lockedAccountCount}
                    </span>
                  ) : (
                    <span className="text-slate-600">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
