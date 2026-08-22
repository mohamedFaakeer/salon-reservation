"use client";

import { useState } from "react";
import {
  ApiRequestError,
  processRetailReturn,
  type RetailReturnDisposition,
  type RetailReturnLineInput,
  type RetailSaleView,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

interface LineDraft {
  disposition: RetailReturnDisposition;
  quantity: number;
  lotCode: string;
  expiresAt: string;
  serialNumber: string;
}

export function RetailReturnDrawer({
  sale,
  onClose,
  onProcessed,
}: {
  sale: RetailSaleView;
  onClose: () => void;
  onProcessed: (updated: RetailSaleView) => void;
}) {
  const returnableLines = sale.lines.filter((l) => l.variantId !== null && l.quantity > l.returnedQuantity);

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      returnableLines.map((l) => [
        l.id,
        { disposition: "RESTOCK" as RetailReturnDisposition, quantity: l.quantity - l.returnedQuantity, lotCode: "", expiresAt: "", serialNumber: "" },
      ]),
    ),
  );
  const [reason, setReason] = useState("");
  const [refundOn, setRefundOn] = useState(true);
  const [refundRupees, setRefundRupees] = useState("");
  const [refundTouched, setRefundTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const includedLines = returnableLines.filter((l) => drafts[l.id]?.quantity > 0);
  const suggestedRefundCents = includedLines.reduce((sum, l) => sum + drafts[l.id].quantity * l.unitPriceCentsSnapshot, 0);
  const refundCents = refundTouched ? Math.round(Number(refundRupees || "0") * 100) : suggestedRefundCents;

  const valid = reason.trim().length >= 3 && includedLines.length > 0;

  function updateDraft(lineId: string, patch: Partial<LineDraft>): void {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
  }

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const lines: RetailReturnLineInput[] = includedLines.map((l) => {
        const d = drafts[l.id];
        return {
          saleLineId: l.id,
          quantity: d.quantity,
          disposition: d.disposition,
          lotCode: d.disposition === "RESTOCK" ? d.lotCode.trim() || undefined : undefined,
          expiresAt: d.disposition === "RESTOCK" ? d.expiresAt || undefined : undefined,
          serialNumber: d.disposition === "RESTOCK" ? d.serialNumber.trim() || undefined : undefined,
        };
      });
      const updated = await processRetailReturn(sale.id, {
        reason: reason.trim(),
        lines,
        refundCents: refundOn && refundCents > 0 ? refundCents : undefined,
      });
      onProcessed(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't record this return.");
    } finally {
      setSubmitting(false);
    }
  }

  const nonReturnableLines = sale.lines.filter((l) => l.variantId === null);

  return (
    <DrawerShell title={`Record return · sale`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <p className="text-sm text-slate-500">
          Choose what came back and whether it restocks or is quarantined. Refund is optional — a same-day exchange needs no money
          moving.
        </p>

        {returnableLines.map((line) => {
          const draft = drafts[line.id];
          const maxQty = line.quantity - line.returnedQuantity;
          return (
            <div key={line.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{line.nameSnapshot}</p>
                  <p className="text-xs text-slate-500">
                    {line.skuSnapshot ?? "—"} · {maxQty} of {line.quantity} left to return
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 rounded-md bg-slate-100 p-0.5">
                  <button
                    type="button"
                    data-testid={`return-line-${line.id}-restock`}
                    onClick={() => updateDraft(line.id, { disposition: "RESTOCK" })}
                    className={`min-h-8 rounded px-2.5 text-xs font-semibold ${
                      draft.disposition === "RESTOCK" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Restock
                  </button>
                  <button
                    type="button"
                    data-testid={`return-line-${line.id}-quarantine`}
                    onClick={() => updateDraft(line.id, { disposition: "QUARANTINE" })}
                    className={`min-h-8 rounded px-2.5 text-xs font-semibold ${
                      draft.disposition === "QUARANTINE" ? "bg-white text-red-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Quarantine
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs text-slate-500">Returning</span>
                <span className="flex items-center overflow-hidden rounded-md border border-slate-300">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => updateDraft(line.id, { quantity: Math.max(0, draft.quantity - 1) })}
                    className="flex h-7 w-7 items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    &minus;
                  </button>
                  <span className="w-6 text-center text-xs font-semibold tabular">{draft.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={draft.quantity >= maxQty}
                    onClick={() => updateDraft(line.id, { quantity: Math.min(maxQty, draft.quantity + 1) })}
                    className="flex h-7 w-7 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    +
                  </button>
                </span>
                {draft.quantity === 0 ? <span className="text-xs text-slate-400">not returned</span> : null}
              </div>

              {draft.quantity > 0 && draft.disposition === "RESTOCK" ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  <p className="text-[11px] text-slate-500">
                    Fill expiry for a cosmetic, or serial for a serialised unit — leave both blank otherwise. A fresh batch is
                    created at this sale's original cost, unless a serial is given (then the exact original unit is reactivated).
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Lot code (optional)"
                      value={draft.lotCode}
                      onChange={(e) => updateDraft(line.id, { lotCode: e.target.value })}
                      className="min-h-9 rounded border border-slate-300 px-2.5 text-xs"
                    />
                    <input
                      type="date"
                      value={draft.expiresAt}
                      onChange={(e) => updateDraft(line.id, { expiresAt: e.target.value })}
                      className="min-h-9 rounded border border-slate-300 px-2.5 text-xs"
                    />
                  </div>
                  <input
                    placeholder="Serial number (for serialised products)"
                    value={draft.serialNumber}
                    onChange={(e) => updateDraft(line.id, { serialNumber: e.target.value })}
                    className="min-h-9 rounded border border-slate-300 px-2.5 text-xs"
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {nonReturnableLines.map((line) => (
          <div key={line.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 opacity-70">
            <div className="flex items-center justify-between gap-2.5">
              <p className="truncate text-sm font-semibold text-slate-900">
                {line.nameSnapshot}
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold text-amber-700">KIT</span>
              </p>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Not returnable</span>
            </div>
            <p className="mt-1.5 border-t border-dashed border-slate-200 pt-1.5 text-[11px] text-slate-500">
              Bundles can&apos;t be returned in Phase B — a clearly disclosed gap, not a hidden one.
            </p>
          </div>
        ))}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Reason <span className="font-normal text-slate-500">required</span>
          </span>
          <textarea
            data-testid="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. client disliked the shade — unopened, box intact"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Refund money</p>
              <p className="text-xs text-slate-500">Optional — omit for an even exchange</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={refundOn}
              data-testid="return-refund-toggle"
              onClick={() => setRefundOn((v) => !v)}
              className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${refundOn ? "bg-teal-600" : "bg-slate-300"}`}
            >
              <span
                className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${refundOn ? "left-[21px]" : "left-[3px]"}`}
              />
            </button>
          </div>
          {refundOn ? (
            <div className="mt-2.5">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Refund amount</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Rs.</span>
                  <input
                    data-testid="return-refund-amount"
                    type="number"
                    min={0}
                    value={refundTouched ? refundRupees : String(suggestedRefundCents / 100)}
                    onChange={(e) => {
                      setRefundTouched(true);
                      setRefundRupees(e.target.value);
                    }}
                    className="min-h-9 w-32 rounded border border-slate-300 px-3 text-sm"
                  />
                </span>
              </label>
              <p className="mt-1.5 text-xs text-slate-500">Through the existing payment refund path, gated to owner/manager.</p>
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="return-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Recording…">
              Record return
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
