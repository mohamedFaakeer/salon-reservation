"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, resetTeamMemberPasswordAsSuperAdmin } from "../lib/api-client";
import { BusyLabel } from "./spinner";

/**
 * Super-admin's cross-tenant password reset (account-lockout-v2,
 * DECISIONS.md) — the one path that can reset an OWNER's own password,
 * since nobody within a salon outranks its owner. Deliberately not the
 * shared light-themed `ConfirmDialog`: this lives inside the dark platform
 * shell, following `DeactivateTenantModal`'s own scaffold rather than its
 * markup, same reasoning that component already documents for itself.
 */
export function ResetLockedAccountModal({
  tenantId,
  tenantName,
  userId,
  onClose,
  onReset,
}: {
  tenantId: string;
  tenantName: string | null;
  userId: string;
  onClose: () => void;
  onReset: (result: { userId: string; temporaryPassword: string }) => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
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
      const result = await resetTeamMemberPasswordAsSuperAdmin(tenantId, userId);
      onReset(result);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not reset this account's password.");
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
        data-testid="reset-locked-account-modal"
        className="motion-rise w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-950 text-amber-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2ZM8 9V7a4 4 0 1 1 8 0v2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id={titleId} className="text-base font-bold text-white">
          Reset this account&apos;s password?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          {tenantName ? `At ${tenantName}, this` : "This"} clears the lockout and signs them out everywhere. A new
          temporary password will be shown once — you&apos;ll need to relay it to them directly, and they&apos;ll be
          asked to choose their own the next time they sign in.
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded border border-red-500 bg-red-950 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="reset-locked-account-cancel"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded border border-slate-600 px-3 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="reset-locked-account-confirm"
            onClick={() => void confirm()}
            disabled={busy}
            className="min-h-11 rounded bg-amber-600 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BusyLabel busy={busy} busyText="Resetting…">
              Reset password
            </BusyLabel>
          </button>
        </div>
      </div>
    </div>
  );
}
