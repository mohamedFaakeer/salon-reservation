"use client";

import { useEffect, useState } from "react";
import {
  fetchEmploymentHistory,
  upsertEmployment,
  type EmploymentView,
  type PayFrequency,
  type StaffMember,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";
import { formatCalendarDate, formatPriceCents, todayLocalDate } from "../lib/format";

const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

function rupeesToCents(input: string): number {
  return Math.round(Number(input) * 100);
}

function centsToRupees(cents: number): string {
  return String(cents / 100);
}

/**
 * Sets, or — if one is already open — supersedes, a staff member's pay.
 *
 * There is no "edit" here: changing pay always opens a new effective-dated
 * version starting the date chosen, and the current one stays in force
 * until then. This mirrors `IncentivePlanDrawer`'s shape but with a
 * frequency toggle in place of independent on/off components, since a
 * staff member is paid one way at a time, not several at once.
 */
export function EmploymentDrawer({
  staff,
  current,
  onClose,
  onSaved,
}: {
  staff: StaffMember;
  /** The staff member's currently open employment version, if any. */
  current: EmploymentView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [frequency, setFrequency] = useState<PayFrequency>(current?.payFrequency ?? "MONTHLY");
  const [rateRupees, setRateRupees] = useState(current ? centsToRupees(current.baseRateCents) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocalDate());
  const [history, setHistory] = useState<EmploymentView[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmploymentHistory(staff.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [staff.id]);

  const rateValid = RUPEE_PATTERN.test(rateRupees) && Number(rateRupees) > 0;
  const dateValid = !current || effectiveFrom > current.effectiveFrom;
  const canSubmit = rateValid && dateValid && effectiveFrom.length > 0;

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await upsertEmployment(staff.id, {
        payFrequency: frequency,
        baseRateCents: rupeesToCents(rateRupees),
        effectiveFrom,
      });
      toast.success(`${staff.name}'s pay updated`);
      onSaved();
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={`${staff.name}'s pay`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {current ? (
          <p className="text-sm text-slate-500">
            Currently {current.payFrequency === "MONTHLY" ? "monthly" : "daily"},{" "}
            {formatPriceCents(current.baseRateCents)}
            {current.payFrequency === "MONTHLY" ? "/month" : "/day"} — since{" "}
            {formatCalendarDate(current.effectiveFrom)}
          </p>
        ) : (
          <p className="text-sm text-slate-500">No pay profile set up yet.</p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Pay frequency</span>
          <div className="inline-flex w-fit rounded-lg border border-slate-300 bg-slate-50 p-0.5">
            {(["MONTHLY", "DAILY"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={frequency === f}
                onClick={() => setFrequency(f)}
                className={`min-h-9 rounded-md px-3.5 text-sm font-semibold ${
                  frequency === f ? "bg-white text-teal-700 shadow-sm" : "text-slate-600"
                }`}
              >
                {f === "MONTHLY" ? "Monthly salary" : "Daily wage"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            {frequency === "MONTHLY" ? "Monthly salary" : "Daily wage"} (Rs.)
          </span>
          <input
            value={rateRupees}
            onChange={(e) => setRateRupees(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={rateRupees.length > 0 && !rateValid}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Effective from</span>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            aria-invalid={effectiveFrom.length > 0 && !dateValid}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
          {current ? (
            <span className="text-xs text-slate-400">
              Must be after {formatCalendarDate(current.effectiveFrom)}, when the current rate started.
            </span>
          ) : null}
        </label>

        {history.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">History</p>
            <div className="flex flex-col divide-y divide-slate-100 rounded border border-slate-200">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-slate-500">
                    {h.payFrequency === "MONTHLY" ? "Monthly" : "Daily"}, since {formatCalendarDate(h.effectiveFrom)}
                    {h.effectiveTo ? ` – ${formatCalendarDate(h.effectiveTo)}` : ""}
                  </span>
                  <span className="tabular font-medium text-slate-900">{formatPriceCents(h.baseRateCents)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Save pay
            </BusyLabel>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
