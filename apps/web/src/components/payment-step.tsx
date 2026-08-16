"use client";

import { useEffect, useState } from "react";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatPriceCents } from "../lib/format";
import { BusyLabel } from "./spinner";

/** Client-side display only — the server's HOLD_EXPIRED response on confirm is the real authority. */
function useCountdown(expiresAt: string): string {
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemainingMs(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PaymentStep({ wizard }: { wizard: BookingWizard }) {
  // Hooks must run unconditionally — fall back to "now" when there's no
  // hold yet so the countdown hook always has a valid input.
  const countdown = useCountdown(wizard.hold?.holdExpiresAt ?? new Date().toISOString());
  if (!wizard.hold) {
    return null;
  }
  const expired = countdown === "0:00";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Confirm &amp; pay</h2>

      <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
        Slot held for <span className="font-semibold tabular-nums">{countdown}</span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Advance required to confirm</p>
        <p className="text-2xl font-semibold text-slate-900">
          {formatPriceCents(wizard.hold.paymentIntent.advanceRequiredCents)}
        </p>
        {wizard.hold.paymentIntent.balanceCents > 0 ? (
          <p className="mt-1 text-sm text-slate-600">
            Balance due at the salon: {formatPriceCents(wizard.hold.paymentIntent.balanceCents)}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">(demo) confirmed by the salon.</p>
      </div>

      {expired ? (
        <p role="alert" className="text-sm text-red-600">
          This hold has expired. Please start again.
        </p>
      ) : wizard.error ? (
        <p role="alert" className="text-sm text-red-600">
          {wizard.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void wizard.cancel()}
          className="min-h-11 flex-1 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="confirm-payment"
          onClick={() => void wizard.confirm()}
          disabled={wizard.submitting || expired}
          className="min-h-11 flex-[2] rounded-md bg-teal-600 px-4 py-2 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <BusyLabel busy={wizard.submitting} busyText="Confirming…">
            Book — pay advance
          </BusyLabel>
        </button>
      </div>
    </div>
  );
}
