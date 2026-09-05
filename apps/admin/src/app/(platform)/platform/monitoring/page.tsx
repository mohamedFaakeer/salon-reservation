"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchMonitoringErrors,
  fetchMonitoringOverview,
  fetchMonitoringSecurityEvents,
  fetchMonitoringTenantUsage,
  updateMonitoringErrorStatus,
  updateMonitoringSecurityEventStatus,
  type ListMeta,
  type MonitoringErrorLog,
  type MonitoringItemStatus,
  type MonitoringOverview,
  type MonitoringSecurityEvent,
  type MonitoringTenantUsage,
} from "../../../../lib/api-client";
import { Pager } from "../../../../components/pager";
import { EventCard } from "../../../../components/monitoring/event-card";
import { OverviewPanel } from "../../../../components/monitoring/overview-panel";
import { ServiceStatusTab } from "../../../../components/monitoring/service-status-tab";
import { TenantUsageTable } from "../../../../components/monitoring/tenant-usage-table";
import { ResetLockedAccountModal } from "../../../../components/reset-locked-account-modal";
import { formatRelativeTime } from "../../../../lib/format";

/**
 * Platform-wide usage, error, and security monitoring — SUPER_ADMIN only.
 *
 * One page, five tabs, the same shape as the notifications page's own tab
 * convention. Severity and plain-language explanation lead every flagged
 * row (user's explicit requirement: a non-technical super admin must be
 * able to tell what happened and whether it needs attention right now,
 * without reading an audit-action string) — the raw technical fields stay
 * available behind each card's own disclosure, never the headline.
 */

const PAGE_SIZE = 25;
type Tab = "overview" | "tenants" | "security" | "errors" | "services";

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Monitoring</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          Usage, errors, security, and live dependency status across every salon on this deployment.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-slate-700">
        {(
          [
            ["overview", "Overview"],
            ["tenants", "Tenant usage"],
            ["security", "Security events"],
            ["errors", "Error log"],
            ["services", "Service status"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`monitoring-tab-${key}`}
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? "border-teal-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "tenants" ? <TenantsTab /> : null}
      {tab === "security" ? <SecurityTab /> : null}
      {tab === "errors" ? <ErrorsTab /> : null}
      {tab === "services" ? <ServiceStatusTab /> : null}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded border border-red-500 bg-red-950 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
  );
}

function LoadingBlocks({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl border border-slate-700 bg-slate-800" />
      ))}
    </div>
  );
}

function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/60 p-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-teal-600 bg-teal-950 text-teal-300">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="max-w-[38ch] text-xs text-slate-400">{hint}</p>
    </div>
  );
}

/* --------------------------------------------------------------- overview -- */

function OverviewTab() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchMonitoringOverview()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load the platform overview."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlocks label="Loading overview" count={2} />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  return <OverviewPanel data={data} />;
}

/* ---------------------------------------------------------------- tenants -- */

function TenantsTab() {
  const [rows, setRows] = useState<MonitoringTenantUsage[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMonitoringTenantUsage({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load salon usage."))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(load, [load]);

  if (loading) return <LoadingBlocks label="Loading salon usage" />;
  if (error) return <ErrorBanner message={error} />;
  if (rows.length === 0) return <EmptyBlock title="No salons yet" hint="Usage appears here once a salon is provisioned." />;

  return (
    <div className="flex flex-col gap-3">
      <TenantUsageTable rows={rows} />
      {meta ? (
        <div className="text-slate-400">
          <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffsetChange={setOffset} unit="salon" busy={loading} />
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- security -- */

function SecurityTab() {
  const [rows, setRows] = useState<MonitoringSecurityEvent[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ tenantId: string; tenantName: string | null; userId: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ temporaryPassword: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMonitoringSecurityEvents({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load security events."))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(load, [load]);

  async function changeStatus(id: string, status: MonitoringItemStatus): Promise<void> {
    if (status === "NEW") return;
    await updateMonitoringSecurityEventStatus(id, status);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  if (loading) return <LoadingBlocks label="Loading security events" />;
  if (error) return <ErrorBanner message={error} />;
  if (rows.length === 0) {
    return (
      <EmptyBlock
        title="No security events in the last 7 days"
        hint="No failed sign-in patterns, blocked sessions, or rejected cross-salon access attempts have been detected. The platform is quiet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {resetResult ? (
        <div
          data-testid="reset-locked-account-credentials"
          role="status"
          className="rounded-xl border border-amber-700 bg-amber-950/60 p-4"
        >
          <p className="text-sm font-semibold text-amber-200">Password reset. Share this once.</p>
          <p className="mt-1 text-xs text-amber-300">
            It is not stored and cannot be shown again — the account is asked to choose its own on next sign-in.
          </p>
          <p className="mt-3 text-sm tabular text-white">{resetResult.temporaryPassword}</p>
          <button
            type="button"
            data-testid="dismiss-reset-locked-account-credentials"
            onClick={() => setResetResult(null)}
            className="mt-3 min-h-9 rounded border border-amber-700 px-3 text-xs font-medium text-amber-200 hover:bg-amber-900"
          >
            Saved it
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <EventCard
            key={row.id}
            testId={`security-event-${row.id}`}
            severity={row.severity}
            status={row.status}
            when={formatRelativeTime(row.createdAt)}
            title={row.title}
            plainLanguage={row.plainLanguage}
            recommendedAction={row.recommendedAction}
            tags={[row.tenantName ?? "Platform-wide"]}
            techDetails={[
              ["Action", row.action],
              ["IP address", row.ipAddress ?? "Not recorded"],
            ]}
            onChangeStatus={(next) => changeStatus(row.id, next)}
            // Only when the lockout resolved to a real tenant grant — a
            // locked SUPER_ADMIN (no tenant) has no salon to act on here at
            // all; its recovery is the CLI break-glass script instead
            // (DECISIONS.md).
            extraAction={
              row.action === "ACCOUNT_LOCKED" && row.tenantId
                ? {
                    label: "Reset password",
                    busyLabel: "Opening…",
                    testId: `security-event-${row.id}-reset-password`,
                    onClick: () => {
                      setResetTarget({ tenantId: row.tenantId as string, tenantName: row.tenantName, userId: row.entityId });
                      return Promise.resolve();
                    },
                  }
                : undefined
            }
          />
        ))}
      </div>
      {meta ? (
        <div className="text-slate-400">
          <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffsetChange={setOffset} unit="event" busy={loading} />
        </div>
      ) : null}

      {resetTarget ? (
        <ResetLockedAccountModal
          tenantId={resetTarget.tenantId}
          tenantName={resetTarget.tenantName}
          userId={resetTarget.userId}
          onClose={() => setResetTarget(null)}
          onReset={(result) => {
            setResetTarget(null);
            setResetResult(result);
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- errors -- */

function ErrorsTab() {
  const [rows, setRows] = useState<MonitoringErrorLog[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMonitoringErrors({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setRows(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load the error log."))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(load, [load]);

  async function changeStatus(id: string, status: MonitoringItemStatus): Promise<void> {
    if (status === "NEW") return;
    await updateMonitoringErrorStatus(id, status);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  if (loading) return <LoadingBlocks label="Loading error log" />;
  if (error) return <ErrorBanner message={error} />;
  if (rows.length === 0) {
    return (
      <EmptyBlock
        title="No server errors in the last 7 days"
        hint="Every request across every salon completed normally. Nothing here needs your attention."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <EventCard
            key={row.id}
            testId={`error-log-${row.id}`}
            severity={row.severity}
            status={row.status}
            when={formatRelativeTime(row.createdAt)}
            title={row.title}
            plainLanguage={row.plainLanguage}
            recommendedAction={row.recommendedAction}
            tags={[row.tenantName ?? "Platform-wide"]}
            techDetails={[
              ["Request", `${row.method} ${row.path}`],
              ["Status code", String(row.statusCode)],
              ["Error code", row.code],
              ["Request ID", row.requestId ?? "Not recorded"],
              ...(row.stack ? ([["Stack", row.stack]] as Array<[string, string]>) : []),
            ]}
            onChangeStatus={(next) => changeStatus(row.id, next)}
          />
        ))}
      </div>
      {meta ? (
        <div className="text-slate-400">
          <Pager total={meta.total} limit={meta.limit} offset={meta.offset} onOffsetChange={setOffset} unit="error" busy={loading} />
        </div>
      ) : null}
    </div>
  );
}
