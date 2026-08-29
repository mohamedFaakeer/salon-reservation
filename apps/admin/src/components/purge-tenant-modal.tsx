"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, purgeTenant } from "../lib/api-client";
import { BusyLabel } from "./spinner";

/**
 * Salon offboarding, the one irreversible step (DECISIONS.md §51). Skips the
 * remaining retention window entirely, so it is deliberately harder to reach
 * than deactivation: a type-the-salon-name-to-confirm gate (GitHub/Vercel
 * convention), the confirm button disabled until it matches exactly, and a
 * kept-vs-erased checklist so the consequence is legible before it happens.
 */
export function PurgeTenantModal({
  tenantId,
  tenantName,
  onClose,
  onPurged,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onPurged: (result: { id: string; purgedAt: string }) => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typedName.trim() === tenantName;

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
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      const result = await purgeTenant(tenantId);
      onPurged(result);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not purge this salon's data.");
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
        data-testid="purge-tenant-modal"
        className="motion-rise w-full max-w-md rounded-2xl border border-red-800 bg-slate-800 p-5 shadow-[0_0_0_1px_rgba(185,28,28,0.25),0_30px_70px_rgba(0,0,0,0.55)]"
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-red-800 bg-red-950 text-red-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id={titleId} className="text-base font-bold text-white">
          Permanently purge {tenantName}?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          This skips the remaining retention window and cannot be undone.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          <ConsequenceItem kind="erase">Customer and staff names, phone numbers, and emails are permanently scrubbed</ConsequenceItem>
          <ConsequenceItem kind="erase">This action cannot be reversed — reactivation stops being possible</ConsequenceItem>
          <ConsequenceItem kind="keep">Payments, invoices, and appointment records are kept, as required for accounting</ConsequenceItem>
          <ConsequenceItem kind="keep">The salon stays on this list as an inert historical record</ConsequenceItem>
        </ul>

        <label htmlFor={`${titleId}-name`} className="mb-1.5 mt-4 block text-xs font-semibold text-slate-400">
          Type <span className="font-bold text-red-300">{tenantName}</span> to confirm
        </label>
        <input
          id={`${titleId}-name`}
          data-testid="purge-confirm-name"
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Salon name"
          autoComplete="off"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
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
            data-testid="purge-cancel"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded border border-slate-600 px-3 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="purge-confirm"
            onClick={() => void confirm()}
            disabled={busy || !matches}
            className="min-h-11 rounded bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-950 disabled:text-red-800"
          >
            <BusyLabel busy={busy} busyText="Purging…">
              Permanently purge data
            </BusyLabel>
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsequenceItem({ kind, children }: { kind: "keep" | "erase"; children: React.ReactNode }) {
  const isKeep = kind === "keep";
  return (
    <li className="flex gap-2.5 text-[13px] leading-relaxed text-slate-200">
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[11px] font-extrabold ${
          isKeep ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"
        }`}
        aria-hidden="true"
      >
        {isKeep ? "✓" : "✕"}
      </span>
      {children}
    </li>
  );
}
