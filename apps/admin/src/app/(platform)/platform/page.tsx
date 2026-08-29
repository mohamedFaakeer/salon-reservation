"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  demoSeedTenant,
  fetchTenants,
  reactivateTenant,
  updateTenantVisibility,
  type DeactivateTenantResult,
  type DemoSeedResult,
  type ListMeta,
  type PlatformTenant,
  type ProvisionTenantResult,
} from "../../../lib/api-client";
import { Pager } from "../../../components/pager";
import { ProvisionTenantDrawer } from "../../../components/provision-tenant-drawer";
import { TenantEntitlementsDrawer } from "../../../components/tenant-entitlements-drawer";
import { DeactivateTenantModal } from "../../../components/deactivate-tenant-modal";
import { PurgeTenantModal } from "../../../components/purge-tenant-modal";
import { BusyLabel } from "../../../components/spinner";
import { formatDate } from "../../../lib/format";

/**
 * Platform administration — the list of salons on this deployment.
 *
 * Two actions only: create a salon with its first owner, and fill a new one
 * with demo data. Everything else about a salon is the salon's own business
 * and is edited from inside it, which is also the only place the permissions
 * allow. Salon offboarding (deactivate/reactivate/purge — DECISIONS.md §51)
 * is the one exception: a platform-admin-only lifecycle a salon cannot run
 * on itself.
 *
 * Deliberately not styled like the salon app. This screen creates accounts and
 * writes data into other people's tenants; it should not look like the screen
 * where someone edits their own opening hours.
 */

const PAGE_SIZE = 25;
/** Mirrors RETENTION_DAYS in apps/api/src/super-admin/tenant-offboarding.service.ts. */
const RETENTION_DAYS = 90;

/** Shown once, right after provisioning — the server keeps only a hash. */
interface NewOwnerCredentials {
  salonName: string;
  slug: string;
  email: string;
  password: string;
}

export default function PlatformPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<NewOwnerCredentials | null>(null);
  const [seedingId, setSeedingId] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<{ slug: string; result: DemoSeedResult } | null>(
    null,
  );
  const [managingPlan, setManagingPlan] = useState<PlatformTenant | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<PlatformTenant | null>(null);
  const [purging, setPurging] = useState<PlatformTenant | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchTenants({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setTenants(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load salons.");
      })
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(load, [load]);

  async function seed(tenant: PlatformTenant): Promise<void> {
    setSeedingId(tenant.id);
    setError(null);
    setSeedResult(null);
    try {
      const result = await demoSeedTenant(tenant.id);
      setSeedResult({ slug: tenant.slug, result });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not seed this salon.");
    } finally {
      setSeedingId(null);
    }
  }

  /**
   * Never touches `status` — staff/admin login for this salon is unaffected
   * either way. Updates the row in place rather than a full reload, since
   * nothing else about the tenant changed.
   */
  async function toggleVisibility(tenant: PlatformTenant): Promise<void> {
    setTogglingId(tenant.id);
    setError(null);
    try {
      const result = await updateTenantVisibility(tenant.id, !tenant.customerBookingEnabled);
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, customerBookingEnabled: result.customerBookingEnabled } : t)),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update this salon's visibility.");
    } finally {
      setTogglingId(null);
    }
  }

  function handleProvisioned(result: ProvisionTenantResult, password: string): void {
    setCreating(false);
    setCredentials({
      salonName: result.tenant.name,
      slug: result.tenant.slug,
      email: result.owner.email,
      password,
    });
    setOffset(0);
    load();
  }

  function handleDeactivated(tenant: PlatformTenant, result: DeactivateTenantResult): void {
    setDeactivating(null);
    setLifecycleMessage(
      result.futureAppointmentCount > 0
        ? `${tenant.name} deactivated. ${result.futureAppointmentCount} upcoming appointment(s) were left untouched — not cancelled, not refunded. Eligible for automatic purge on ${formatDate(result.purgeEligibleAt)} unless reactivated.`
        : `${tenant.name} deactivated. It had no upcoming appointments. Eligible for automatic purge on ${formatDate(result.purgeEligibleAt)} unless reactivated.`,
    );
    load();
  }

  async function reactivate(tenant: PlatformTenant): Promise<void> {
    setReactivatingId(tenant.id);
    setError(null);
    try {
      await reactivateTenant(tenant.id);
      setLifecycleMessage(`${tenant.name} reactivated.`);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not reactivate this salon.");
    } finally {
      setReactivatingId(null);
    }
  }

  function handlePurged(tenant: PlatformTenant): void {
    setPurging(null);
    setLifecycleMessage(`${tenant.name}'s personal data has been permanently anonymized. Payment and appointment records were kept.`);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Salons</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Every tenant on this deployment, newest first.
          </p>
        </div>
        <button
          type="button"
          data-testid="new-tenant-button"
          onClick={() => setCreating(true)}
          className="min-h-11 rounded bg-teal-500 px-4 text-sm font-medium text-teal-950 hover:bg-teal-400"
        >
          New salon
        </button>
      </div>

      {credentials ? (
        <div
          data-testid="new-owner-credentials"
          role="status"
          className="rounded-lg border border-teal-400 bg-teal-950 p-4"
        >
          <p className="text-sm font-semibold text-teal-200">
            {credentials.salonName} is ready.
          </p>
          <p className="mt-1 text-xs text-teal-300">
            Give these to the owner now. The password is not stored and cannot be shown again.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal-400">
                Sign in at
              </dt>
              <dd className="text-sm text-white">/login</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal-400">
                Email
              </dt>
              <dd className="text-sm text-white">{credentials.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-teal-400">
                Password
              </dt>
              <dd className="text-sm text-white tabular">{credentials.password}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-teal-300">
            Customers book at <span className="text-white">/salon/{credentials.slug}</span>
          </p>
          <button
            type="button"
            data-testid="dismiss-credentials"
            onClick={() => setCredentials(null)}
            className="mt-3 min-h-11 rounded border border-teal-500 px-3 text-xs font-medium text-teal-200 hover:bg-teal-900"
          >
            I've saved these
          </button>
        </div>
      ) : null}

      {seedResult ? (
        <p role="status" className="rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200">
          {seedResult.result.seeded
            ? `Seeded ${seedResult.slug}: ${seedResult.result.counts.services} services, ${seedResult.result.counts.staff} staff, ${seedResult.result.counts.customers} customers, ${seedResult.result.counts.appointments} appointments.`
            : `${seedResult.slug} already had data — nothing was changed.`}
        </p>
      ) : null}

      {lifecycleMessage ? (
        <p
          role="status"
          data-testid="lifecycle-message"
          className="flex items-start justify-between gap-3 rounded border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200"
        >
          <span>{lifecycleMessage}</span>
          <button
            type="button"
            onClick={() => setLifecycleMessage(null)}
            className="shrink-0 text-xs font-medium text-amber-400 hover:text-amber-200"
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded border border-red-500 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div role="status" aria-label="Loading salons" className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-slate-700 bg-slate-800" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <p className="rounded-lg border border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-400">
          No salons yet. Create the first one.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {tenants.map((tenant) =>
              tenant.purgedAt ? (
                <PurgedTenantRow key={tenant.id} tenant={tenant} />
              ) : tenant.deletionRequestedAt ? (
                <DeactivatedTenantRow
                  key={tenant.id}
                  tenant={tenant}
                  busy={reactivatingId === tenant.id}
                  onReactivate={() => void reactivate(tenant)}
                  onPurge={() => setPurging(tenant)}
                />
              ) : (
                <ActiveTenantRow
                  key={tenant.id}
                  tenant={tenant}
                  toggling={togglingId === tenant.id}
                  seeding={seedingId === tenant.id}
                  onManagePlan={() => setManagingPlan(tenant)}
                  onToggleVisibility={() => void toggleVisibility(tenant)}
                  onSeed={() => void seed(tenant)}
                  onDeactivate={() => setDeactivating(tenant)}
                />
              ),
            )}
          </ul>

          {meta ? (
            <div className="text-slate-400">
              <Pager
                total={meta.total}
                limit={meta.limit}
                offset={meta.offset}
                onOffsetChange={setOffset}
                unit="salon"
                busy={loading}
              />
            </div>
          ) : null}
        </>
      )}

      {creating ? (
        <ProvisionTenantDrawer
          onClose={() => setCreating(false)}
          onProvisioned={handleProvisioned}
        />
      ) : null}

      {managingPlan ? (
        <TenantEntitlementsDrawer
          tenant={managingPlan}
          onClose={() => setManagingPlan(null)}
          onSaved={() => {
            setManagingPlan(null);
            load();
          }}
        />
      ) : null}

      {deactivating ? (
        <DeactivateTenantModal
          tenantId={deactivating.id}
          tenantName={deactivating.name}
          onClose={() => setDeactivating(null)}
          onDeactivated={(result) => handleDeactivated(deactivating, result)}
        />
      ) : null}

      {purging ? (
        <PurgeTenantModal
          tenantId={purging.id}
          tenantName={purging.name}
          onClose={() => setPurging(null)}
          onPurged={() => handlePurged(purging)}
        />
      ) : null}
    </div>
  );
}

function ActiveTenantRow({
  tenant,
  toggling,
  seeding,
  onManagePlan,
  onToggleVisibility,
  onSeed,
  onDeactivate,
}: {
  tenant: PlatformTenant;
  toggling: boolean;
  seeding: boolean;
  onManagePlan: () => void;
  onToggleVisibility: () => void;
  onSeed: () => void;
  onDeactivate: () => void;
}) {
  return (
    <li
      data-testid={`tenant-row-${tenant.slug}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{tenant.name}</span>
          <StatusPill tenant={tenant} />
          <TierPill tier={tenant.tier} />
          {!tenant.customerBookingEnabled ? (
            <span className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-200">
              Hidden from customers
            </span>
          ) : null}
          {tenant.overBookingLimit ? (
            <span className="flex items-center gap-1 rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-200">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
                <path
                  d="M8 2.5 14 13H2L8 2.5Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path d="M8 6.3v3M8 11.3h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {tenant.bookingsToday} bookings today
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-400 tabular">
          /salon/{tenant.slug} · {tenant.currency} · {tenant.timezone} · added{" "}
          {formatDate(tenant.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          data-testid={`manage-plan-${tenant.slug}`}
          onClick={onManagePlan}
          className="min-h-11 rounded border border-teal-500 px-3 text-xs font-medium text-teal-300 hover:bg-teal-950"
        >
          Manage plan
        </button>
        <button
          type="button"
          data-testid={`toggle-visibility-${tenant.slug}`}
          onClick={onToggleVisibility}
          disabled={toggling}
          className={`min-h-11 rounded border px-3 text-xs font-medium disabled:opacity-60 ${
            tenant.customerBookingEnabled
              ? "border-amber-600 text-amber-300 hover:bg-amber-950"
              : "border-teal-500 text-teal-300 hover:bg-teal-950"
          }`}
        >
          <BusyLabel busy={toggling} busyText="Updating…">
            {tenant.customerBookingEnabled ? "Hide from customers" : "Show to customers"}
          </BusyLabel>
        </button>
        <button
          type="button"
          data-testid={`seed-${tenant.slug}`}
          onClick={onSeed}
          disabled={seeding}
          className="min-h-11 rounded border border-slate-600 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
        >
          <BusyLabel busy={seeding} busyText="Seeding…">
            Add demo data
          </BusyLabel>
        </button>
        <button
          type="button"
          data-testid={`deactivate-${tenant.slug}`}
          onClick={onDeactivate}
          className="min-h-11 rounded border border-red-900 px-3 text-xs font-medium text-red-300 hover:bg-red-950/60"
        >
          Deactivate
        </button>
      </div>
    </li>
  );
}

/** Purge-eligible date is computed client-side (deletionRequestedAt + 90 days) — the server keeps the retention rule, not a stored date. */
function purgeEligibleDate(deletionRequestedAt: string): Date {
  return new Date(new Date(deletionRequestedAt).getTime() + RETENTION_DAYS * 24 * 60 * 60_000);
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60_000)));
}

function DeactivatedTenantRow({
  tenant,
  busy,
  onReactivate,
  onPurge,
}: {
  tenant: PlatformTenant;
  busy: boolean;
  onReactivate: () => void;
  onPurge: () => void;
}) {
  // deletionRequestedAt is guaranteed non-null by the caller's branch, but
  // TypeScript can't see that across the two components — narrow locally.
  if (!tenant.deletionRequestedAt) return null;
  const eligible = purgeEligibleDate(tenant.deletionRequestedAt);
  const days = daysUntil(eligible);

  return (
    <li
      data-testid={`tenant-row-${tenant.slug}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-600 bg-slate-800/60 p-3"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{tenant.name}</span>
          <StatusPill tenant={tenant} />
        </p>
        <p className="mt-0.5 text-xs text-slate-500 tabular">
          <span className="line-through opacity-70">/salon/{tenant.slug}</span> · not booked or discovered by
          customers
        </p>
        {tenant.deactivationReason ? (
          <p className="mt-1 text-xs italic text-slate-400">&ldquo;{tenant.deactivationReason}&rdquo;</p>
        ) : null}
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-300">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Eligible for automatic purge on <span className="font-semibold text-amber-200">{formatDate(eligible.toISOString())}</span>{" "}
          ({days} day{days === 1 ? "" : "s"}) unless reactivated
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid={`reactivate-${tenant.slug}`}
          onClick={onReactivate}
          disabled={busy}
          className="min-h-11 rounded border border-teal-500 px-3 text-xs font-medium text-teal-300 hover:bg-teal-950 disabled:opacity-60"
        >
          <BusyLabel busy={busy} busyText="Reactivating…">
            Reactivate
          </BusyLabel>
        </button>
        <span className="mx-1 h-6 w-px bg-slate-700" aria-hidden="true" />
        <button
          type="button"
          data-testid={`purge-${tenant.slug}`}
          onClick={onPurge}
          className="min-h-11 rounded border border-red-900 px-3 text-xs font-medium text-red-300 hover:bg-red-950/60"
        >
          Purge now
        </button>
      </div>
    </li>
  );
}

function PurgedTenantRow({ tenant }: { tenant: PlatformTenant }) {
  return (
    <li
      data-testid={`tenant-row-${tenant.slug}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 opacity-60"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-300">{tenant.name}</span>
          <StatusPill tenant={tenant} />
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Personal data anonymized{tenant.purgedAt ? ` on ${formatDate(tenant.purgedAt)}` : ""} · payment and
          appointment history preserved
        </p>
      </div>
      <p className="text-xs italic text-slate-500">No actions available</p>
    </li>
  );
}

function StatusPill({ tenant }: { tenant: PlatformTenant }) {
  if (tenant.purgedAt) {
    return (
      <span className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
        Purged
      </span>
    );
  }
  if (tenant.deletionRequestedAt) {
    return (
      <span className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-200">
        Deactivated
      </span>
    );
  }
  if (tenant.status === "ACTIVE") {
    return (
      <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-200">
        Active
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-200">
      {tenant.status.toLowerCase()}
    </span>
  );
}

function TierPill({ tier }: { tier: "LITE" | "PRO" }) {
  if (tier === "PRO") {
    return (
      <span className="rounded bg-teal-900 px-2 py-0.5 text-xs font-medium text-teal-200">Pro</span>
    );
  }
  return (
    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">Lite</span>
  );
}
