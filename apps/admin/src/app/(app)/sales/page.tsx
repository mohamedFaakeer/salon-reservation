"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiRequestError, fetchRetailSales, type RetailSaleView } from "../../../lib/api-client";
import { formatDate, formatPriceCents, formatTime } from "../../../lib/format";
import { ModuleGate } from "../../../components/module-gate";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { TOUR_ANCHORS } from "../../../lib/tour-anchors";

const STATUS_STYLE: Record<RetailSaleView["status"], { label: string; className: string }> = {
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  PARTIALLY_RETURNED: { label: "Partially returned", className: "bg-amber-100 text-amber-700" },
  RETURNED: { label: "Returned", className: "bg-red-100 text-red-700" },
};

export default function SalesPageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <SalesPage />
    </ModuleGate>
  );
}

function SalesPage() {
  const [sales, setSales] = useState<RetailSaleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    fetchRetailSales({ q: query || undefined, limit: 50 })
      .then((res) => setSales(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load sales."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(""), [load]);

  const todaysTakingsCents = sales
    .filter((s) => new Date(s.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.totalCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sales</h1>
          <p className="mt-0.5 text-sm text-slate-500">Retail checkouts rung up at the counter — open one to restock or quarantine a return.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          data-testid="sales-search"
          data-tour-id={TOUR_ANCHORS.sales.searchField}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              load(q);
            }
          }}
          placeholder="Search by customer or product…"
          className="min-h-11 max-w-sm flex-1 rounded border border-slate-300 px-3 text-sm"
        />
        <span className="text-xs text-slate-500 tabular">Today&apos;s takings · {formatPriceCents(todaysTakingsCents)}</span>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : sales.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">No sales yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.1fr_1.1fr_0.7fr_0.8fr_0.9fr_0.6fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Sale</span>
            <span>Customer</span>
            <span>Items</span>
            <span>Total</span>
            <span>Status</span>
            <span />
          </div>
          {sales.map((sale) => {
            const status = STATUS_STYLE[sale.status];
            const itemCount = sale.lines.reduce((n, l) => n + l.quantity, 0);
            return (
              <Link
                key={sale.id}
                href={`/sales/${sale.id}`}
                data-testid={`sale-row-${sale.id}`}
                data-tour-id={TOUR_ANCHORS.sales.rowLink}
                className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.1fr_1.1fr_0.7fr_0.8fr_0.9fr_0.6fr] sm:items-center sm:gap-3"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{formatDate(sale.createdAt)}</span>
                  <span className="block text-xs text-slate-400">{formatTime(sale.createdAt)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{sale.customer.name}</span>
                  <span className="block truncate text-xs text-slate-400">{sale.customer.isWalkIn ? "no phone" : sale.customer.phone}</span>
                </span>
                <span className="text-slate-500">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
                <span className="tabular font-semibold text-slate-900">{formatPriceCents(sale.totalCents)}</span>
                <span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                </span>
                <span className="justify-self-end text-xs font-semibold text-teal-700">Open</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
