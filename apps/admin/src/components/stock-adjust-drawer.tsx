"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  adjustStock,
  fetchVariantBatches,
  fetchVariants,
  type ProductVariantRecord,
  type StockAdjustmentType,
  type StockBatchRecord,
} from "../lib/api-client";
import { formatDate } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

const TYPE_OPTIONS: Array<{ value: StockAdjustmentType; label: string }> = [
  { value: "ADJUSTMENT", label: "Adjustment (stock take, found stock)" },
  { value: "WRITE_OFF", label: "Write-off (breakage, theft, expiry)" },
];

export function StockAdjustDrawer({ onClose, onAdjusted }: { onClose: () => void; onAdjusted: () => void }) {
  const [variants, setVariants] = useState<ProductVariantRecord[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [variantId, setVariantId] = useState("");
  const [batches, setBatches] = useState<StockBatchRecord[]>([]);
  const [batchId, setBatchId] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<StockAdjustmentType>("ADJUSTMENT");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVariants({ limit: 200 })
      .then((res) => {
        setVariants(res.data);
        setVariantId(res.data[0]?.id ?? "");
      })
      .finally(() => setLoadingVariants(false));
  }, []);

  useEffect(() => {
    if (!variantId) {
      setBatches([]);
      return;
    }
    setBatchId("");
    fetchVariantBatches(variantId)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [variantId]);

  const quantityNumber = Number(quantity);
  const valid = variantId.length > 0 && Number.isFinite(quantityNumber) && quantityNumber > 0 && reason.trim().length >= 3;

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adjustStock({
        variantId,
        batchId: batchId || undefined,
        quantityDelta: direction === "add" ? quantityNumber : -quantityNumber,
        type,
        reason: reason.trim(),
      });
      onAdjusted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save this adjustment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Adjust stock" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {loadingVariants ? (
          <p className="text-sm text-slate-500">Loading products…</p>
        ) : variants.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
            Add a product and a variant first, under Products.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Variant</span>
              <select
                data-testid="adjust-variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.product?.name ?? "—"} — {v.sku}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Batch <span className="font-normal text-slate-500">(optional — omit to adjust the variant's total)</span>
              </span>
              <select
                data-testid="adjust-batch"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              >
                <option value="">Any batch (oldest-expiring first)</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.serialNumber
                      ? `Serial ${b.serialNumber}`
                      : `Lot ${b.lotCode ?? "—"}${b.expiresAt ? ` · expires ${formatDate(b.expiresAt)}` : ""}`}{" "}
                    · {b.quantityRemaining} remaining
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate-700">Direction</legend>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="adjust-direction-add"
                  onClick={() => setDirection("add")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${direction === "add" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                >
                  Add stock
                </button>
                <button
                  type="button"
                  data-testid="adjust-direction-remove"
                  onClick={() => setDirection("remove")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${direction === "remove" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                >
                  Remove stock
                </button>
              </div>
            </fieldset>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Quantity</span>
              <input
                data-testid="adjust-quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                data-testid="adjust-type"
                value={type}
                onChange={(e) => setType(e.target.value as StockAdjustmentType)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Reason</span>
              <textarea
                data-testid="adjust-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Recount after weekly stock take"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </>
        )}

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
            data-testid="adjust-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Save adjustment
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
