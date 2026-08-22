"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, fetchRetailReturns, fetchRetailSale, type RetailReturnView, type RetailSaleView } from "../../../../lib/api-client";
import { canIssueRefund } from "../../../../lib/permissions";
import { useAuth } from "../../../../context/auth-context";
import { formatDate, formatPriceCents, formatTime } from "../../../../lib/format";
import { ModuleGate } from "../../../../components/module-gate";
import { LoadingSkeleton } from "../../../../components/loading-skeleton";
import { RetailReturnDrawer } from "../../../../components/retail-return-drawer";

const STATUS_STYLE: Record<RetailSaleView["status"], { label: string; className: string }> = {
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  PARTIALLY_RETURNED: { label: "Partially returned", className: "bg-amber-100 text-amber-700" },
  RETURNED: { label: "Returned", className: "bg-red-100 text-red-700" },
};

const DISPOSITION_LABEL: Record<string, string> = {
  RESTOCK: "restocked",
  QUARANTINE: "quarantined",
};

export default function SaleDetailPageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <SaleDetailPage />
    </ModuleGate>
  );
}

function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const saleId = params.id;
  const { user } = useAuth();
  const canReturn = canIssueRefund(user?.roles ?? []);

  const [sale, setSale] = useState<RetailSaleView | null>(null);
  const [returns, setReturns] = useState<RetailReturnView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturn, setShowReturn] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchRetailSale(saleId), fetchRetailReturns(saleId)])
      .then(([saleRes, returnsRes]) => {
        setSale(saleRes);
        setReturns(returnsRes);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load this sale."))
      .finally(() => setLoading(false));
  }, [saleId]);

  useEffect(load, [load]);

  if (loading) {
    return <LoadingSkeleton rows={6} />;
  }

  if (error || !sale) {
    return (
      <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error ?? "Sale not found."}
      </p>
    );
  }

  const status = STATUS_STYLE[sale.status];
  const canStillReturn = sale.lines.some((l) => l.variantId !== null && l.quantity > l.returnedQuantity);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {formatDate(sale.createdAt)} <span className="font-normal text-slate-400">at {formatTime(sale.createdAt)}</span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {sale.soldByName ? `Rung up by ${sale.soldByName}` : "Rung up"} ·{" "}
            <span className={`inline-flex rounded-full px-2 py-0.5 align-middle text-[10px] font-bold ${status.className}`}>
              {status.label}
            </span>
          </p>
        </div>
        {canReturn && canStillReturn ? (
          <button
            type="button"
            data-testid="sale-record-return"
            onClick={() => setShowReturn(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Record return
          </button>
        ) : null}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Items</p>
          <div className="mt-2 flex flex-col gap-2">
            {sale.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-b-0 last:pb-0">
                <span className="min-w-0 truncate text-slate-700">
                  {line.nameSnapshot}
                  {line.bundleId ? (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold text-amber-700">
                      KIT
                    </span>
                  ) : null}
                  <span className="tabular text-slate-400"> ×{line.quantity}</span>
                  {line.returnedQuantity > 0 ? (
                    <span className="ml-1.5 text-xs text-slate-400">({line.returnedQuantity} returned)</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular font-medium text-slate-900">{formatPriceCents(line.lineTotalCents)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
              <span>Total</span>
              <span className="tabular">{formatPriceCents(sale.totalCents)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Customer</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{sale.customer.name}</p>
            {!sale.customer.isWalkIn ? <p className="mt-0.5 text-sm text-slate-500">{sale.customer.phone}</p> : null}
          </div>
        </div>
      </div>

      {returns.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Return history</p>
          <div className="flex flex-col gap-3">
            {returns.map((r) => (
              <div key={r.id} className="border-l-2 border-slate-300 py-1 pl-3.5">
                <p className="text-xs text-slate-500">
                  {formatDate(r.createdAt)} · {formatTime(r.createdAt)}
                </p>
                <p className="text-sm font-semibold text-slate-900">{r.processedByName ?? "Staff"}</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {r.lines.map((l) => `${l.quantity} unit${l.quantity === 1 ? "" : "s"} ${DISPOSITION_LABEL[l.disposition]}`).join(", ")}
                  {r.refundedCents > 0 ? ` · ${formatPriceCents(r.refundedCents)} refunded` : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">&ldquo;{r.reason}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showReturn ? (
        <RetailReturnDrawer
          sale={sale}
          onClose={() => setShowReturn(false)}
          onProcessed={(updated) => {
            setSale(updated);
            setShowReturn(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
