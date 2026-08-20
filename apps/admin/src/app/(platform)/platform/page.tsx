"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  demoSeedTenant,
  fetchTenants,
  type DemoSeedResult,
  type ListMeta,
  type PlatformTenant,
  type ProvisionTenantResult,
} from "../../../lib/api-client";
import { Pager } from "../../../components/pager";
import { ProvisionTenantDrawer } from "../../../components/provision-tenant-drawer";
import { BusyLabel } from "../../../components/spinner";
import { formatDate } from "../../../lib/format";

/**
 * Platform administration — the list of salons on this deployment.
 *
 * Two actions only: create a salon with its first owner, and fill a new one
 * with demo data. Everything else about a salon is the salon's own business
 * and is edited from inside it, which is also the only place the permissions
 * allow.
 *
 * Deliberately not styled like the salon app. This screen creates accounts and
 * writes data into other people's tenants; it should not look like the screen
 * where someone edits their own opening hours.
 */

const PAGE_SIZE = 25;

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
            {tenants.map((tenant) => (
              <li
                key={tenant.id}
                data-testid={`tenant-row-${tenant.slug}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="font-medium text-white">{tenant.name}</span>
                    <StatusPill status={tenant.status} />
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 tabular">
                    /salon/{tenant.slug} · {tenant.currency} · {tenant.timezone} · added{" "}
                    {formatDate(tenant.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`seed-${tenant.slug}`}
                  onClick={() => void seed(tenant)}
                  disabled={seedingId === tenant.id}
                  className="min-h-11 shrink-0 rounded border border-slate-600 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
                >
                  <BusyLabel busy={seedingId === tenant.id} busyText="Seeding…">
                    Add demo data
                  </BusyLabel>
                </button>
              </li>
            ))}
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
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-200">
        Active
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-200">
      {status.toLowerCase()}
    </span>
  );
}
