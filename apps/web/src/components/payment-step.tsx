"use client";

import { useEffect, useState } from "react";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatPriceCents } from "../lib/format";
import { useCustomerAuth } from "../context/customer-auth-context";
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

/**
 * Checking is a pure read — the balance shown here is a preview, not a
 * commitment. The real deduction happens server-side when "Book it" is
 * pressed, which is also why the "To confirm" figure above doesn't
 * live-update from this check: recalculating it here would mean the client
 * computing a discount, which CLAUDE.md rules out.
 */
function GiftCardEntry({ wizard }: { wizard: BookingWizard }) {
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--dye-mid)] p-3.5">
      <p className="text-[13px] font-bold text-[var(--resist)]">Have a gift card?</p>
      <div className="mt-2 flex gap-2">
        <input
          data-testid="gift-card-code-input"
          value={wizard.giftCardCode}
          onChange={(e) => wizard.setGiftCardCode(e.target.value.toUpperCase())}
          placeholder="ELE-GC-XXXXXXXXXX"
          className="min-h-11 flex-1 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.18)] bg-[var(--dye-deep)] px-3 font-mono text-[13px] uppercase tracking-wide text-[var(--resist)] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--resist-dim)]"
        />
        <DyeButton
          testId="gift-card-check"
          onClick={() => void wizard.checkGiftCard()}
          disabled={wizard.giftCardChecking || wizard.giftCardCode.trim().length === 0}
          className="!min-h-11 !px-4 !text-[12.5px]"
        >
          <BusyLabel busy={wizard.giftCardChecking} busyText="Checking…">
            Check
          </BusyLabel>
        </DyeButton>
      </div>

      {wizard.giftCardApplied && wizard.giftCardPreview ? (
        <div className="mt-2.5 rounded-[var(--radius-sm)] border border-[rgba(123,227,208,0.35)] bg-[rgba(15,163,150,0.1)] p-2.5">
          <p className="display tabular text-[18px] text-[var(--bloom)]">
            {formatPriceCents(wizard.giftCardPreview.remainingBalanceCents)}{" "}
            <span className="text-[11px] font-normal text-[var(--resist-dim)]">available</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--resist-dim)]">
            Will be applied when you book — expires{" "}
            {new Date(wizard.giftCardPreview.expiresAt).toLocaleDateString("en-LK", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            .
          </p>
        </div>
      ) : null}

      {wizard.giftCardError ? (
        <p role="alert" className="mt-2.5 text-[12px] text-[var(--alarm)]">
          {wizard.giftCardError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Same box and Check flow as `GiftCardEntry` — the one thing a package
 * needs that a gift card never does is a mismatch state, for when the code
 * is real but doesn't cover the service being booked.
 */
function PackageEntry({ wizard }: { wizard: BookingWizard }) {
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--dye-mid)] p-3.5">
      <p className="text-[13px] font-bold text-[var(--resist)]">Have a package?</p>
      <div className="mt-2 flex gap-2">
        <input
          data-testid="package-code-input"
          value={wizard.packageCode}
          onChange={(e) => wizard.setPackageCode(e.target.value.toUpperCase())}
          placeholder="ELE-PKG-XXXXXXXXXX"
          className="min-h-11 flex-1 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.18)] bg-[var(--dye-deep)] px-3 font-mono text-[13px] uppercase tracking-wide text-[var(--resist)] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--resist-dim)]"
        />
        <DyeButton
          testId="package-check"
          onClick={() => void wizard.checkPackage()}
          disabled={wizard.packageChecking || wizard.packageCode.trim().length === 0}
          className="!min-h-11 !px-4 !text-[12.5px]"
        >
          <BusyLabel busy={wizard.packageChecking} busyText="Checking…">
            Check
          </BusyLabel>
        </DyeButton>
      </div>

      {wizard.packageApplied && wizard.packagePreview ? (
        <div className="mt-2.5 rounded-[var(--radius-sm)] border border-[rgba(123,227,208,0.35)] bg-[rgba(15,163,150,0.1)] p-2.5">
          <p className="display tabular text-[18px] text-[var(--bloom)]">
            {wizard.packagePreview.remainingUses}{" "}
            <span className="text-[11px] font-normal text-[var(--resist-dim)]">visits left</span>
          </p>
          <p className="mt-1 inline-flex rounded-full bg-[rgba(123,227,208,0.12)] px-2.5 text-[11px] font-semibold text-[var(--bloom)]">
            {wizard.packagePreview.serviceNameSnapshot}
          </p>
          <p className="mt-1.5 text-[11px] text-[var(--resist-dim)]">
            Will be applied when you book — expires{" "}
            {new Date(wizard.packagePreview.expiresAt).toLocaleDateString("en-LK", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            .
          </p>
        </div>
      ) : null}

      {wizard.packageError ? (
        <p role="alert" className="mt-2.5 text-[12px] text-[var(--alarm)]">
          {wizard.packageError}
        </p>
      ) : null}
    </div>
  );
}

export function PaymentStep({ wizard }: { wizard: BookingWizard }) {
  // Hooks run unconditionally — fall back to now when there is no hold yet.
  const hold = useHold(wizard.hold?.holdExpiresAt ?? new Date().toISOString());
  const auth = useCustomerAuth();
  if (!wizard.hold) {
    return null;
  }

  const { advanceRequiredCents, balanceCents } = wizard.hold.paymentIntent;
  const expired = hold.state === "expired";
  // A guest (no account at all) never sees any of this — the button has
  // always just said "Book it". Only a logged-in, still-unverified account
  // gets the extra step (DECISIONS.md §46, mockup review).
  const needsVerification = Boolean(auth.account && !auth.account.phoneVerified);

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

      {!expired ? <GiftCardEntry wizard={wizard} /> : null}
      {!expired ? <PackageEntry wizard={wizard} /> : null}

      {wizard.error && !expired ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] border border-[#B3261E] bg-[rgba(179,38,30,0.08)] p-3 text-[13px] font-semibold text-[#8C1D18]"
        >
          {wizard.error}
        </p>
      ) : null}

      {needsVerification && !expired ? (
        <p className="mt-3 rounded-[var(--radius-sm)] border border-[rgba(46,58,140,0.25)] bg-[rgba(46,58,140,0.08)] p-3 text-[13px] font-semibold text-[var(--indigo)]">
          Verify your mobile number to finish booking — takes 30 seconds.
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
              onClick={() =>
                needsVerification ? auth.openVerifyForCurrentAccount() : void wizard.confirm()
              }
              disabled={wizard.submitting}
              className="flex-[2]"
            >
              <BusyLabel busy={wizard.submitting} busyText="Confirming…">
                {needsVerification ? "Verify mobile number" : "Book it"}
              </BusyLabel>
            </DyeButton>
          </>
        )}
      </div>
    </div>
  );
}
