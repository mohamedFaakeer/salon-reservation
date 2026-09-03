"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, fetchVariants, receiveStock, type ProductVariantRecord } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

interface BatchRow {
  key: string;
  variantId: string;
  quantity: string;
  unitCostRupees: string;
  lotCode: string;
  expiresAt: string;
  serialNumber: string;
}

function newRow(defaultVariantId: string): BatchRow {
  return {
    key: `row-${Math.random().toString(36).slice(2)}`,
    variantId: defaultVariantId,
    quantity: "",
    unitCostRupees: "",
    lotCode: "",
    expiresAt: "",
    serialNumber: "",
  };
}

export function StockReceiveDrawer({ onClose, onReceived }: { onClose: () => void; onReceived: () => void }) {
  const [variants, setVariants] = useState<ProductVariantRecord[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [supplierName, setSupplierName] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVariants({ limit: 200 })
      .then((res) => {
        setVariants(res.data);
        setRows([newRow(res.data[0]?.id ?? "")]);
      })
      .finally(() => setLoadingVariants(false));
  }, []);

  function updateRow(key: string, patch: Partial<BatchRow>): void {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string): void {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addRow(): void {
    setRows((prev) => [...prev, newRow(variants[0]?.id ?? "")]);
  }

  function variantFor(id: string): ProductVariantRecord | undefined {
    return variants.find((v) => v.id === id);
  }

  const rowsValid = rows.length > 0 && rows.every((row) => {
    const variant = variantFor(row.variantId);
    const quantity = Number(row.quantity);
    const unitCost = Number(row.unitCostRupees);
    if (!variant || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return false;
    }
    if (variant.product?.tracksExpiry && !row.expiresAt) {
      return false;
    }
    if (variant.product?.trackSerial && (!row.serialNumber.trim() || quantity !== 1)) {
      return false;
    }
    return true;
  });

  async function submit(): Promise<void> {
    if (!rowsValid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await receiveStock({
        supplierName: supplierName.trim() || undefined,
        referenceNote: referenceNote.trim() || undefined,
        batches: rows.map((row) => ({
          variantId: row.variantId,
          quantity: Number(row.quantity),
          unitCostCents: Math.round(Number(row.unitCostRupees) * 100),
          lotCode: row.lotCode.trim() || undefined,
          expiresAt: row.expiresAt || undefined,
          serialNumber: row.serialNumber.trim() || undefined,
        })),
      });
      onReceived();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't record this receipt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Receive stock" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Supplier <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="receipt-supplier"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. Hemas Consumer Brands"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Reference note <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="receipt-reference"
            value={referenceNote}
            onChange={(e) => setReferenceNote(e.target.value)}
            placeholder="Invoice #, delivery note…"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Batches received</h3>

          {loadingVariants ? (
            <p className="text-sm text-slate-500">Loading products…</p>
          ) : variants.length === 0 ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
              Add a product and a variant first, under Products.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((row, i) => {
                const variant = variantFor(row.variantId);
                return (
                  <div
                    key={row.key}
                    className="rounded-lg border border-slate-200 p-3"
                    data-tour-id={TOUR_ANCHORS.stockReceiveDrawer.batchRow}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        Batch {i + 1}
                      </span>
                      {rows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <label className="mb-2 flex flex-col gap-1 text-xs">
                      <span className="font-medium text-slate-700">Variant</span>
                      <select
                        data-testid={`receipt-variant-${i}`}
                        value={row.variantId}
                        onChange={(e) => updateRow(row.key, { variantId: e.target.value })}
                        className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                      >
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.product?.name ?? "—"} — {v.sku}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-medium text-slate-700">Quantity</span>
                        <input
                          data-testid={`receipt-qty-${i}`}
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                          className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-medium text-slate-700">Unit cost (Rs)</span>
                        <input
                          data-testid={`receipt-cost-${i}`}
                          type="number"
                          min={0}
                          value={row.unitCostRupees}
                          onChange={(e) => updateRow(row.key, { unitCostRupees: e.target.value })}
                          className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                        />
                      </label>
                    </div>

                    {variant?.product?.trackSerial ? (
                      <label className="mt-2 flex flex-col gap-1 text-xs">
                        <span className="font-medium text-slate-700">Serial number</span>
                        <input
                          data-testid={`receipt-serial-${i}`}
                          value={row.serialNumber}
                          onChange={(e) => updateRow(row.key, { serialNumber: e.target.value })}
                          placeholder="One unit per batch line"
                          className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                        />
                      </label>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="font-medium text-slate-700">
                            Lot code <span className="font-normal text-slate-500">(optional)</span>
                          </span>
                          <input
                            value={row.lotCode}
                            onChange={(e) => updateRow(row.key, { lotCode: e.target.value })}
                            className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                          />
                        </label>
                        {variant?.product?.tracksExpiry ? (
                          <label className="flex flex-col gap-1 text-xs">
                            <span className="font-medium text-slate-700">Expires on</span>
                            <input
                              data-testid={`receipt-expiry-${i}`}
                              type="date"
                              value={row.expiresAt}
                              onChange={(e) => updateRow(row.key, { expiresAt: e.target.value })}
                              className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
                            />
                          </label>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addRow}
                className="min-h-10 w-full rounded-md border border-dashed border-slate-300 bg-teal-50 text-sm font-semibold text-teal-700 hover:bg-teal-100"
              >
                + Add another batch
              </button>
            </div>
          )}
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
            data-testid="receipt-submit"
            data-tour-id={TOUR_ANCHORS.stockReceiveDrawer.submitButton}
            disabled={!rowsValid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Recording…">
              Record receipt
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
