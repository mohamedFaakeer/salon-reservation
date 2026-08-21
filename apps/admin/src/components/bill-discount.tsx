"use client";

import { useState } from "react";
import {
  ApiRequestError,
  setAppointmentDiscount,
  type AppointmentDetail,
  type DiscountTypeValue,
} from "../lib/api-client";
import { errorCopy } from "../lib/error-copy";
import { formatPriceCents } from "../lib/format";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";

/**
 * Take something off this bill.
 *
 * Sits above the payment form because the order is the real one: you agree
 * the price, then you take the money. Putting it inside the payment form
 * would suggest a discount belongs to one tender rather than to the bill.
 *
 * The cap lives on the server and the client does not know it. A refusal
 * comes back as a plain sentence saying what the caller may approve and who
 * to ask — which is more use than a number this component could only guess
 * at, and cannot be talked around by editing the page.
 */
export function BillDiscount({
  appointment,
  onChanged,
}: {
  appointment: AppointmentDetail;
  onChanged: () => void;
}) {
  const applied = appointment.billDiscountCents > 0;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DiscountTypeValue>(appointment.billDiscountType ?? "PERCENT");
  const [value, setValue] = useState(initialValue(appointment));
  const [reason, setReason] = useState(appointment.billDiscountReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();

  /** What was owed after the salon's own offers — the base a discount comes off. */
  const serviceOffers = appointment.discountCents - appointment.billDiscountCents;
  const afterOffers = Math.max(0, appointment.subtotalCents - serviceOffers);
  const preview = previewCents(type, value, afterOffers);

  async function submit(nextValue: number): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await setAppointmentDiscount(appointment.id, {
        type,
        value: nextValue,
        reason: reason.trim() || undefined,
      });
      toast.success(
        nextValue === 0 ? "Discount removed" : "Discount applied",
        nextValue === 0 ? undefined : `${formatPriceCents(preview)} off this bill.`,
      );
      setOpen(false);
      onChanged();
    } catch (err) {
      const copy = errorCopy(err);
      // The cap refusal is not really an error — it is the system telling the
      // operator who to ask — so it stays inline rather than shouting.
      const capped = err instanceof ApiRequestError && err.code === "DISCOUNT_CAP_EXCEEDED";
      setError(capped ? err.message : copy.title);
      if (!capped) {
        toast.error(copy.title, copy.detail);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2">
        {applied ? (
          <span className="min-w-0 text-sm">
            <span className="font-medium text-slate-900 tabular">
              −{formatPriceCents(appointment.billDiscountCents)}
            </span>{" "}
            <span className="text-slate-500">
              off{appointment.billDiscountReason ? ` · ${appointment.billDiscountReason}` : ""}
            </span>
          </span>
        ) : (
          <span className="text-sm text-slate-500">No discount on this bill</span>
        )}
        <button
          type="button"
          data-testid="open-bill-discount"
          onClick={() => setOpen(true)}
          className="min-h-9 shrink-0 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {applied ? "Change" : "Add discount"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded border border-slate-200 p-3">
      <div className="grid grid-cols-2 gap-1.5">
        {(["PERCENT", "FIXED"] as DiscountTypeValue[]).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`bill-discount-${option}`}
            aria-pressed={type === option}
            // Clearing on switch: 500 means two very different things either
            // side of this toggle.
            onClick={() => {
              setType(option);
              setValue("");
            }}
            className={`min-h-9 rounded border text-xs font-medium transition-colors ${
              type === option
                ? "border-teal-600 bg-teal-50 text-teal-800"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {option === "PERCENT" ? "Percentage" : "Fixed amount"}
          </button>
        ))}
      </div>

      <label className="text-xs text-slate-500">
        {type === "PERCENT" ? "Percent off" : "Rupees off"}
        <input
          type="number"
          data-testid="bill-discount-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          min={0}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm tabular"
        />
      </label>

      <label className="text-xs text-slate-500">
        Reason
        <input
          type="text"
          data-testid="bill-discount-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Regular customer, service ran late…"
          maxLength={200}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      {preview > 0 ? (
        <p data-testid="bill-discount-preview" className="text-xs text-slate-600 tabular">
          {formatPriceCents(afterOffers)} → {" "}
          <strong className="text-slate-900">{formatPriceCents(afterOffers - preview)}</strong>{" "}
          <span className="text-slate-500">(−{formatPriceCents(preview)})</span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        {applied ? (
          <button
            type="button"
            data-testid="remove-bill-discount"
            disabled={busy}
            onClick={() => void submit(0)}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          data-testid="apply-bill-discount"
          disabled={busy || preview <= 0}
          onClick={() => void submit(toApiValue(type, value))}
          className="flex-1 rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <BusyLabel busy={busy} busyText="Applying…">
            Apply
          </BusyLabel>
        </button>
      </div>
    </div>
  );
}

function initialValue(appointment: AppointmentDetail): string {
  if (appointment.billDiscountValue === null) {
    return "";
  }
  return appointment.billDiscountType === "PERCENT"
    ? String(appointment.billDiscountValue)
    : String(appointment.billDiscountValue / 100);
}

function toApiValue(type: DiscountTypeValue, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return type === "PERCENT" ? Math.round(n) : Math.round(n * 100);
}

/** Mirrors the server's own clamp so the preview cannot promise more than it gives. */
function previewCents(type: DiscountTypeValue, value: string, afterOffers: number): number {
  const raw =
    type === "PERCENT"
      ? Math.round((afterOffers * Number(value || 0)) / 100)
      : toApiValue(type, value);
  return Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, afterOffers));
}
