"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, voidGiftCard, type GiftCardView } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { BusyLabel } from "./spinner";

/**
 * Same `alertdialog` chrome and focus handling as `ConfirmDialog`, but with
 * a required reason field the confirm button stays disabled without —
 * `ConfirmDialog` itself has no room for a validated input inside its fixed
 * body, so this is a dedicated sibling rather than a prop bent to fit.
 */
export function GiftCardVoidModal({
  card,
  onClose,
  onVoided,
}: {
  card: GiftCardView;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, busy]);

  const valid = reason.trim().length >= 3;

  async function confirm(): Promise<void> {
    if (!valid) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await voidGiftCard(card.id, reason.trim());
      onVoided();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't void this gift card right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="motion-rise w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          Void this gift card?
        </h2>

        <div className="mt-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <svg width="16" height="16" viewBox="0 0 16 16" className="mt-0.5 shrink-0" aria-hidden="true" focusable="false">
            <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>
            <span className="font-mono font-semibold">{card.code}</span> has{" "}
            {formatPriceCents(card.remainingBalanceCents)} remaining. Voiding stops it from being redeemed
            again — this can&apos;t be undone.
          </span>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Reason</span>
          <textarea
            data-testid="gift-card-void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this being voided?"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Keep card
          </button>
          <button
            type="button"
            data-testid="gift-card-void-confirm"
            disabled={!valid || busy}
            onClick={() => void confirm()}
            className="min-h-11 rounded bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={busy} busyText="Voiding…">
              Void gift card
            </BusyLabel>
          </button>
        </div>
      </div>
    </div>
  );
}
