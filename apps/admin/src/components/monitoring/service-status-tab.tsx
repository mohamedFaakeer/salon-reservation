"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchServiceStatus, type ServiceStatusEntry } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/format";
import { DependencyStatusPill, OriginTag } from "./event-card";

/**
 * Same polling convention as `notification-bell.tsx` (the only existing
 * precedent in this app) — no socket infrastructure exists anywhere, and
 * Render's free tier sleeping after 15 minutes idle fights a persistent
 * connection anyway. A missed poll is invisible by design; the next one
 * 30s later catches up.
 */
const POLL_MS = 30_000;

const CARD_TONE: Record<ServiceStatusEntry["status"], string> = {
  down: "border-red-800 bg-red-950/40",
  degraded: "border-amber-800 bg-amber-950/30",
  healthy: "border-slate-700 bg-slate-800",
  not_configured: "border-slate-700 bg-slate-800",
  not_applicable: "border-slate-700 bg-slate-800",
};

export function ServiceStatusTab() {
  const [entries, setEntries] = useState<ServiceStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const result = await fetchServiceStatus();
      setEntries(result.data);
      setError(null);
    } catch {
      // A missed poll is invisible by design — the next one 30s later
      // catches up, same reasoning as the notification bell's own poll.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  if (loading && entries.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-700 bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          What&apos;s actually reachable right now, and whether a problem is ours to fix or theirs to wait out.
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
          Auto-refreshing every 30s
        </span>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-500 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <article
            key={entry.id}
            data-testid={`service-status-card-${entry.id}`}
            className={`flex flex-col gap-2 rounded-xl border p-4 ${CARD_TONE[entry.status]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[14.5px] font-semibold text-white">{entry.label}</p>
              <span className="shrink-0 text-[11px] text-slate-500 tabular">
                {entry.status === "not_applicable" ? "—" : `Checked ${formatRelativeTime(entry.lastCheckedAt)}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <DependencyStatusPill status={entry.status} />
              {entry.origin ? <OriginTag origin={entry.origin} /> : null}
            </div>

            <p className={`text-sm leading-relaxed ${entry.status === "healthy" || entry.status === "not_applicable" ? "text-slate-400" : "text-slate-300"}`}>
              {entry.message}
            </p>

            {entry.lastErrorAt ? (
              <details className="mt-1 text-[11.5px]">
                <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">
                  Technical details
                </summary>
                <div className="mt-2 flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-slate-400">
                  <div>
                    <span className="text-slate-600">last failure: </span>
                    <span className="text-slate-300">{formatRelativeTime(entry.lastErrorAt)}</span>
                  </div>
                </div>
              </details>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-1 max-w-[74ch] text-[12.5px] text-slate-500">
        Best-effort, from real but imperfect signals (recent failure history, not a live provider ping) — a
        &ldquo;Degraded&rdquo; or &ldquo;Down&rdquo; reading is a strong hint, not a certainty.
      </p>
    </div>
  );
}
