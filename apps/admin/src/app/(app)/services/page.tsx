"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  fetchServices,
  updateService,
  type ServiceItem,
} from "../../../lib/api-client";
import { canManageServices } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row, RowActions } from "../../../components/data-table";
import { ServiceDrawer } from "../../../components/service-drawer";
import { BusyLabel } from "../../../components/spinner";
import { formatDurationMin, formatPriceCents } from "../../../lib/format";

/**
 * Each branch keeps its own complete class string rather than sharing one
 * template with a ternary — the surface and its text stay visibly paired, and
 * nothing can read zinc text as sitting on the emerald ground.
 */
function ActivePill({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Active
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
      Retired
    </span>
  );
}

export default function ServicesPage() {
  const { user } = useAuth();
  const canManage = canManageServices(user?.roles ?? []);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchServices()
      .then(setServices)
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load services.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const categories = useMemo(
    () => [...new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c)))].sort(),
    [services],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services
      .filter((s) => (showInactive ? true : s.active))
      .filter((s) => (category ? s.category === category : true))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }, [services, query, category, showInactive]);

  async function toggleActive(service: ServiceItem): Promise<void> {
    setTogglingId(service.id);
    setError(null);
    try {
      await updateService(service.id, { active: !service.active });
      load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Could not change this service's status.",
      );
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Services</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            What the salon sells, how long it takes, what it costs.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            data-testid="new-service-button"
            onClick={() => setCreating(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            New service
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          data-testid="service-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          aria-label="Search services"
          className="min-h-11 min-w-48 flex-1 rounded border border-slate-300 px-3 text-sm"
        />
        <select
          data-testid="service-category-filter"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3 text-sm text-slate-700">
          <input
            type="checkbox"
            data-testid="show-inactive"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show retired
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            services.length === 0
              ? "No services yet — add the first thing your salon sells."
              : "No services match those filters."
          }
          action={
            canManage && services.length === 0
              ? { label: "New service", onClick: () => setCreating(true) }
              : undefined
          }
        />
      ) : (
        <DataTable
          caption="Services offered by this salon"
          columns={[
            { label: "Service" },
            { label: "Category" },
            { label: "Duration", align: "right" },
            { label: "Price", align: "right" },
            { label: "Status" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {visible.map((service) => (
            <Row key={service.id} muted={!service.active} testId={`service-row-${service.id}`}>
              <Cell>
                <span className={service.active ? "font-medium text-slate-900" : "text-slate-500"}>
                  {service.name}
                </span>
                {!service.active ? (
                  <span className="block text-xs text-slate-500">
                    Retired — kept on past bookings
                  </span>
                ) : null}
              </Cell>
              <Cell>
                {service.category ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {service.category}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </Cell>
              <Cell align="right">{formatDurationMin(service.durationMin)}</Cell>
              <Cell align="right">{formatPriceCents(service.priceCents)}</Cell>
              <Cell>
                <ActivePill active={service.active} />
              </Cell>
              {canManage ? (
                <RowActions>
                  <button
                    type="button"
                    data-testid={`edit-service-${service.id}`}
                    onClick={() => setEditing(service)}
                    className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    data-testid={`toggle-service-${service.id}`}
                    onClick={() => void toggleActive(service)}
                    disabled={togglingId === service.id}
                    className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                  >
                    <BusyLabel busy={togglingId === service.id} busyText="Saving…">
                      {service.active ? "Retire" : "Restore"}
                    </BusyLabel>
                  </button>
                </RowActions>
              ) : (
                <Cell />
              )}
            </Row>
          ))}
        </DataTable>
      )}

      {creating ? (
        <ServiceDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}
      {editing ? (
        <ServiceDrawer
          service={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
