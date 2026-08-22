"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import { ApiRequestError, fetchVariants, type ProductVariantRecord } from "../../../lib/api-client";
import { canManageInventory } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { ModuleGate } from "../../../components/module-gate";
import { StockReceiveDrawer } from "../../../components/stock-receive-drawer";
import { StockAdjustDrawer } from "../../../components/stock-adjust-drawer";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { useToast } from "../../../components/toast";

export default function StockPageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <StockPage />
    </ModuleGate>
  );
}

function StockPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.roles ?? []);
  const toast = useToast();

  const [variants, setVariants] = useState<ProductVariantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const load = useCallback((query: string, lowStock: boolean) => {
    setLoading(true);
    setError(null);
    fetchVariants({ q: query || undefined, lowStockOnly: lowStock || undefined, limit: 200 })
      .then((res) => setVariants(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load stock."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load("", lowStockOnly), [load, lowStockOnly]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Stock is managed by the salon owner and managers.
        </p>
      </div>
    );
  }

  const lowStockCount = variants.filter(
    (v) => v.reorderPoint !== null && v.quantityOnHand <= v.reorderPoint,
  ).length;
  const reorderSoonCount = variants.filter((v) => v.reorderSoon).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Stock</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {variants.length} variants{lowStockCount > 0 ? ` · ${lowStockCount} below reorder point` : ""}
            {reorderSoonCount > 0 ? ` · ${reorderSoonCount} reorder soon` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="stock-adjust-open"
            onClick={() => setShowAdjust(true)}
            className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Adjust stock
          </button>
          <button
            type="button"
            data-testid="stock-receive-open"
            onClick={() => setShowReceive(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            + Receive stock
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          data-testid="stock-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              load(q, lowStockOnly);
            }
          }}
          placeholder="Search by SKU, barcode or product…"
          className="min-h-11 max-w-sm rounded border border-slate-300 px-3 text-sm"
        />
        <label className="flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3 text-sm text-slate-700">
          <input
            type="checkbox"
            data-testid="stock-low-only"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Low stock only
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : variants.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {lowStockOnly ? "Nothing is below its reorder point." : "No stock recorded yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.3fr_1fr_0.7fr_0.7fr_0.7fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Product</span>
            <span>Variant</span>
            <span>On hand</span>
            <span>Reorder at</span>
            <span>Avg cost</span>
            <span>Reorder signal</span>
          </div>
          {variants.map((variant) => {
            const isLow = variant.reorderPoint !== null && variant.quantityOnHand <= variant.reorderPoint;
            return (
              <div
                key={variant.id}
                data-testid={`stock-row-${variant.sku}`}
                className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1.3fr_1fr_0.7fr_0.7fr_0.7fr_1fr] sm:items-center sm:gap-3"
              >
                <span className="truncate font-medium text-slate-900">{variant.product?.name ?? "—"}</span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12px] font-semibold text-slate-900">{variant.sku}</span>
                  <span className="block truncate text-xs text-slate-400">{variant.barcode ?? "No barcode"}</span>
                </span>
                <span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular ${isLow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}
                  >
                    {variant.quantityOnHand} units
                  </span>
                </span>
                <span className="tabular text-slate-600">{variant.reorderPoint ?? "—"}</span>
                <span className="tabular text-slate-600">{formatPriceCents(variant.weightedAvgCostCents)}</span>
                <span className="min-w-0">
                  {variant.reorderSoon ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Reorder soon
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                  {variant.daysOfStockLeft !== null && variant.daysOfStockLeft !== undefined ? (
                    <span className="mt-0.5 block text-[11px] tabular text-slate-500">
                      ~{variant.daysOfStockLeft}d left · {variant.salesVelocityPerDay}/day
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showReceive ? (
        <StockReceiveDrawer
          onClose={() => setShowReceive(false)}
          onReceived={() => {
            setShowReceive(false);
            toast.success("Stock received");
            load(q, lowStockOnly);
          }}
        />
      ) : null}

      {showAdjust ? (
        <StockAdjustDrawer
          onClose={() => setShowAdjust(false)}
          onAdjusted={() => {
            setShowAdjust(false);
            toast.success("Stock adjusted");
            load(q, lowStockOnly);
          }}
        />
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Stock</h1>
      <p className="mt-0.5 text-sm text-slate-500">What's on hand, and what needs reordering</p>
    </div>
  );
}
