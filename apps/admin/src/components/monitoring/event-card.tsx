"use client";

import { useState } from "react";
import type { MonitoringItemStatus, MonitoringSeverity } from "../../lib/api-client";
import { Spinner } from "../spinner";

/**
 * Monitoring's own severity/status vocabulary, distinct from the rest of the
 * admin app (which is light-themed) — this whole surface lives inside the
 * dark platform shell (`(platform)/layout.tsx`) on purpose, same reasoning
 * the tenant list already documents: a different job, a different blast
 * radius, a chrome that never looks like "editing my own salon".
 */
const SEVERITY_STYLE: Record<MonitoringSeverity, { label: string; className: string; dot: string }> = {
  CRITICAL: { label: "Critical", className: "border-red-700 bg-red-950 text-red-200", dot: "bg-red-500" },
  HIGH: { label: "High", className: "border-orange-700 bg-orange-950 text-orange-200", dot: "bg-orange-400" },
  MEDIUM: { label: "Medium", className: "border-amber-700 bg-amber-950 text-amber-200", dot: "bg-amber-400" },
  LOW: { label: "Low", className: "border-slate-600 bg-slate-800 text-slate-300", dot: "bg-slate-400" },
};

export function SeverityBadge({ severity }: { severity: MonitoringSeverity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${s.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

const STATUS_STYLE: Record<MonitoringItemStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "border-teal-400 text-teal-300 bg-teal-400/10" },
  ACKNOWLEDGED: { label: "Acknowledged", className: "border-slate-500 text-slate-300 bg-slate-500/10" },
  RESOLVED: { label: "Resolved", className: "border-emerald-400 text-emerald-300 bg-emerald-400/10" },
};

export function StatusPill({ status }: { status: MonitoringItemStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

const SEVERITY_BORDER: Record<MonitoringSeverity, string> = {
  CRITICAL: "border-l-red-600",
  HIGH: "border-l-orange-600",
  MEDIUM: "border-l-amber-600",
  LOW: "border-l-slate-500",
};

/**
 * One flagged item — a security event or a server error — rendered so a
 * non-technical super admin reads severity and plain-language impact first,
 * with the raw fields (IP, action code, path, stack) behind a disclosure
 * rather than the headline.
 */
export function EventCard({
  testId,
  severity,
  status,
  when,
  title,
  plainLanguage,
  recommendedAction,
  tags,
  techDetails,
  onChangeStatus,
}: {
  testId: string;
  severity: MonitoringSeverity;
  status: MonitoringItemStatus;
  when: string;
  title: string;
  plainLanguage: string;
  recommendedAction: string;
  tags: string[];
  techDetails: Array<[string, string]>;
  /** Omit to render the card read-only (used for the Overview preview). */
  onChangeStatus?: (next: "ACKNOWLEDGED" | "RESOLVED") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"ACKNOWLEDGED" | "RESOLVED" | null>(null);

  async function act(next: "ACKNOWLEDGED" | "RESOLVED"): Promise<void> {
    if (!onChangeStatus) return;
    setBusy(next);
    try {
      await onChangeStatus(next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      data-testid={testId}
      className={`flex flex-col gap-2 rounded-xl border border-slate-700 border-l-4 bg-slate-800 p-4 ${SEVERITY_BORDER[severity]} ${status === "RESOLVED" ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} />
          <StatusPill status={status} />
        </div>
        <span className="text-[11px] text-slate-500 tabular">{when}</span>
      </div>

      <div>
        <p className="text-[14.5px] font-semibold text-white">{title}</p>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-slate-300">{plainLanguage}</p>
        <p className="mt-1.5 text-[12.5px] text-teal-300">
          <span className="font-semibold text-teal-200">Suggested: </span>
          {recommendedAction}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
              {t}
            </span>
          ))}
        </div>
        {onChangeStatus && status !== "RESOLVED" ? (
          <div className="flex gap-2">
            {status === "NEW" ? (
              <button
                type="button"
                data-testid={`${testId}-acknowledge`}
                onClick={() => void act("ACKNOWLEDGED")}
                disabled={busy !== null}
                className="min-h-9 rounded border border-slate-600 px-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-60"
              >
                {busy === "ACKNOWLEDGED" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> Acknowledging…
                  </span>
                ) : (
                  "Acknowledge"
                )}
              </button>
            ) : null}
            <button
              type="button"
              data-testid={`${testId}-resolve`}
              onClick={() => void act("RESOLVED")}
              disabled={busy !== null}
              className="min-h-9 rounded border border-teal-500 px-2.5 text-xs font-semibold text-teal-300 hover:bg-teal-950 disabled:opacity-60"
            >
              {busy === "RESOLVED" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner /> Resolving…
                </span>
              ) : (
                "Mark resolved"
              )}
            </button>
          </div>
        ) : null}
      </div>

      {techDetails.length > 0 ? (
        <details className="mt-1 text-[11.5px]">
          <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">
            Technical details
          </summary>
          <div className="mt-2 flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-slate-400">
            {techDetails.map(([k, v]) => (
              <div key={k}>
                <span className="text-slate-600">{k}: </span>
                <span className="text-slate-300">{v}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
