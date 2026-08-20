"use client";

import { useEffect, useState } from "react";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatPriceCents } from "../lib/format";
import { DyeButton, Marker } from "./cloth";
import { BusyLabel } from "./spinner";

/**
 * Confirm and pay.
 *
 * The hold has three genuinely distinct states rather than one number that
 * changes colour: held, running out, gone. Each says something different and
 * offers a different action, because "4:58" and "0:12" are not the same
 * situation and a customer should not have to read a clock to tell.
 *
 * The countdown is display only. The server's HOLD_EXPIRED response on confirm
 * is the authority; this just stops someone typing into a dead form.
 */

type HoldState = "held" | "running-out" | "expired";

function useHold(expiresAt: string): { label: string; fraction: number; state: HoldState } {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const seconds = Math.max(0, Math.floor(remaining / 1000));
  const minutes = Math.floor(seconds / 60);
  const label = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  // Holds are ten minutes server-side; the bar is a trend, not a measurement.
  const fraction = Math.max(0, Math.min(1, seconds / 600));
  const state: HoldState = seconds === 0 ? "expired" : seconds <= 120 ? "running-out" : "held";
  return { label, fraction, state };
}

export function PaymentStep({ wizard }: { wizard: BookingWizard }) {
  // Hooks run unconditionally — fall back to now when there is no hold yet.
  const hold = useHold(wizard.hold?.holdExpiresAt ?? new Date().toISOString());
  if (!wizard.hold) {
    return null;
  }

  const { advanceRequiredCents, balanceCents } = wizard.hold.paymentIntent;
  const expired = hold.state === "expired";

  return (
    <div>
      <h2 className="display text-[28px] text-[var(--ink)]">
        Confirm
        <span className="block">your visit.</span>
      </h2>

      <div
        role="status"
        aria-live={hold.state === "running-out" ? "assertive" : "polite"}
        className={`mt-4 rounded-[var(--radius-sm)] border p-3.5 ${
          expired
            ? "border-[#B3261E] bg-[rgba(179,38,30,0.08)]"
            : hold.state === "running-out"
              ? "border-[var(--alarm)] bg-[rgba(224,163,60,0.12)]"
              : "border-[rgba(18,48,44,0.16)]"
        }`}
      >
        {expired ? (
          <p className="text-[13px] font-bold text-[#8C1D18]">
            The hold ran out and the slot went back to the salon. Pick another time — it only takes
            a moment.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--ink)]">
                {hold.state === "running-out" ? "Nearly out of time" : "Slot held for you"}
              </span>
              <span className="display tabular text-[16px] text-[var(--ink)]">{hold.label}</span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[rgba(18,48,44,0.12)]">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${hold.fraction * 100}%`,
                  background: hold.state === "running-out" ? "var(--alarm)" : "var(--dye)",
                }}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-[var(--radius)] bg-[var(--dye-deep)] p-4 text-[var(--resist)]">
        <Marker>To confirm</Marker>
        <p className="display display-wide tabular mt-1 text-[34px] leading-none">
          {formatPriceCents(advanceRequiredCents)}
        </p>
        {balanceCents > 0 ? (
          <p className="tabular mt-2 text-[12.5px] text-[var(--bloom)]">
            {formatPriceCents(balanceCents)} due at the salon
          </p>
        ) : null}
        <p className="mt-3 border-t border-[rgba(240,231,214,0.16)] pt-3 text-[11.5px] text-[var(--resist-dim)]">
          Demo build — no card is charged. The salon records payment when you arrive.
        </p>
      </div>

      {wizard.error && !expired ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] border border-[#B3261E] bg-[rgba(179,38,30,0.08)] p-3 text-[13px] font-semibold text-[#8C1D18]"
        >
          {wizard.error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        {expired ? (
          <DyeButton onClick={() => wizard.goTo("slots")} className="flex-1">
            Pick another time
          </DyeButton>
        ) : (
          <>
            <DyeButton tone="quiet" onClick={() => void wizard.cancel()} className="flex-1 !text-[var(--ink)] !border-[rgba(18,48,44,0.24)]">
              Cancel
            </DyeButton>
            <DyeButton
              testId="confirm-payment"
              onClick={() => void wizard.confirm()}
              disabled={wizard.submitting}
              className="flex-[2]"
            >
              <BusyLabel busy={wizard.submitting} busyText="Confirming…">
                Book it
              </BusyLabel>
            </DyeButton>
          </>
        )}
      </div>
    </div>
  );
}
