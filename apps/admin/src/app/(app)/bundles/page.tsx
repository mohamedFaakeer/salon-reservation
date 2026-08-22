"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import { ApiRequestError, fetchBundles, type BundleView } from "../../../lib/api-client";
import { canManageInventory } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { ModuleGate } from "../../../components/module-gate";
import { BundleDrawer } from "../../../components/bundle-drawer";
import { LoadingSkeleton } from "../../../components/loading-skeleton";

export default function BundlesPageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <BundlesPage />
    </ModuleGate>
  );
}

function BundlesPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.roles ?? []);

  const [bundles, setBundles] = useState<BundleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    fetchBundles({ q: query || undefined, includeInactive: true })
      .then((res) => setBundles(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load bundles."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(""), [load]);

  const activeCount = bundles.filter((b) => b.active).length;
  const inactiveCount = bundles.length - activeCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Bundles</h1>
          <p className="mt-0.5 text-sm text-slate-500">Kits sold as one line — availability is always computed from live component stock.</p>
        </div>
        {canManage ? (
          <button
            type="button"
            data-testid="bundle-create-open"
            onClick={() => setShowCreate(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            + Create bundle
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          data-testid="bundle-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              load(q);
            }
          }}
          placeholder="Search bundles…"
          className="min-h-11 max-w-sm flex-1 rounded border border-slate-300 px-3 text-sm"
        />
        <span className="text-xs text-slate-500">
          {activeCount} active{inactiveCount > 0 ? ` · ${inactiveCount} discontinued` : ""}
        </span>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : bundles.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No bundles yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.6fr_0.8fr_0.7fr_0.8fr_0.7fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Name</span>
            <span>Components</span>
            <span>Price</span>
            <span>Available</span>
            <span>Status</span>
          </div>
          {bundles.map((bundle) => (
            <div
              key={bundle.id}
              data-testid={`bundle-row-${bundle.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditingId(bundle.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditingId(bundle.id);
                }
              }}
              className="grid cursor-pointer grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.6fr_0.8fr_0.7fr_0.8fr_0.7fr] sm:items-center sm:gap-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="7" height="7" rx="1.3" />
                    <rect x="7" y="7" width="7" height="7" rx="1.3" fill="currentColor" opacity="0.15" />
                  </svg>
                </span>
                <span className={`block truncate font-medium ${bundle.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                  {bundle.name}
                </span>
              </span>
              <span className="text-slate-500">
                {bundle.components.length} item{bundle.components.length === 1 ? "" : "s"}
              </span>
              <span className={`tabular font-semibold ${bundle.active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                {formatPriceCents(bundle.priceCents)}
              </span>
              <span className={`tabular font-semibold ${!bundle.active ? "text-slate-400" : bundle.availableCount > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {bundle.active ? `${bundle.availableCount} set${bundle.availableCount === 1 ? "" : "s"}` : "—"}
              </span>
              <span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    bundle.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {bundle.active ? "Active" : "Discontinued"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <BundleDrawer
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            load(q);
          }}
        />
      ) : null}

      {editingId ? (
        <BundleDrawer
          bundleId={editingId}
          onClose={() => {
            setEditingId(null);
            load(q);
          }}
          onSaved={() => {
            setEditingId(null);
            load(q);
          }}
        />
      ) : null}
    </div>
  );
}
