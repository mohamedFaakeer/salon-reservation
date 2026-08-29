"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, deactivateTenant, type DeactivateTenantResult } from "../lib/api-client";
import { BusyLabel } from "./spinner";

/**
 * Salon offboarding, step one (DECISIONS.md §51) — reversible. Deliberately
 * not the shared light-themed `ConfirmDialog`: this lives inside the dark
 * platform shell, and needs its own reason field, so it borrows that
 * component's focus/Escape/backdrop-click scaffolding rather than its markup.
 *
 * The future-appointment count is informational-only per the locked product
 * decision (never blocks, never auto-cancels) — and since there is no
 * preview endpoint, it can only be known once the action actually completes,
 * so this dialog states the policy in general terms and the caller shows the
 * real number afterward, in the success banner.
 */
export function DeactivateTenantModal({
  tenantId,
  tenantName,
  onClose,
  onDeactivated,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onDeactivated: (result: DeactivateTenantResult) => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await deactivateTenant(tenantId, reason.trim() || undefined);
      onDeactivated(result);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not deactivate this salon.");
      setBusy(false);
    }
  }

  return (
    <div
      className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="deactivate-tenant-modal"
        className="motion-rise w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-950 text-amber-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 9v4M12 17h.01M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id={titleId} className="text-base font-bold text-white">
          Deactivate {tenantName}?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          Staff will be signed out and unable to log back in. Customers will no longer find or book this salon. This
          is fully reversible — reactivating restores everything instantly.
        </p>

        <div className="mt-4 flex gap-2.5 rounded-lg border border-sky-900 bg-sky-950/60 px-3 py-2.5 text-[13px] leading-relaxed text-sky-200">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-sky-400" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8h.01M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>
            Any upcoming appointments will be left exactly as they are — not cancelled, not refunded. The salon is
            expected to have already resolved these.
          </span>
        </div>

        <label htmlFor={`${titleId}-reason`} className="mb-1.5 mt-4 block text-xs font-semibold text-slate-400">
          Reason (optional, for your own records)
        </label>
        <textarea
          id={`${titleId}-reason`}
          data-testid="deactivate-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Owner stopped paying, salon permanently closed…"
          rows={3}
          maxLength={500}
          className="w-full resize-y rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />

        {error ? (
          <p role="alert" className="mt-3 rounded border border-red-500 bg-red-950 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="deactivate-cancel"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded border border-slate-600 px-3 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="deactivate-confirm"
            onClick={() => void confirm()}
            disabled={busy}
            className="min-h-11 rounded bg-amber-600 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BusyLabel busy={busy} busyText="Deactivating…">
              Deactivate salon
            </BusyLabel>
          </button>
        </div>
      </div>
    </div>
  );
}
