"use client";

import { useState } from "react";
import { ApiRequestError, createClosure } from "../lib/api-client";
import { todayLocalDate } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { TOUR_ANCHORS } from "../lib/tour-anchors";

/** Salon-wide shutdown — a public holiday or refurbishment. Applies to everyone. */
export function ClosureDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayLocalDate());
  const [endDate, setEndDate] = useState(todayLocalDate());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && endDate >= startDate;

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createClosure({ name: name.trim(), startDate, endDate });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not add this closure.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Add closure" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm" data-tour-id={TOUR_ANCHORS.closureDrawer.nameField}>
          <span className="font-medium text-slate-700">Name</span>
          <input
            data-testid="closure-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sinhala &amp; Tamil New Year"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3" data-tour-id={TOUR_ANCHORS.closureDrawer.datesField}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">From</span>
            <input
              data-testid="closure-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">To</span>
            <input
              data-testid="closure-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
        </div>

        {endDate < startDate ? (
          <p className="text-xs text-amber-800">The end date has to be on or after the start.</p>
        ) : null}

        <p className="text-xs text-slate-500">
          Closing the salon stops new bookings on these dates. Appointments already in the diary
          are not cancelled — you still need to contact those customers.
        </p>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="closure-save"
            data-tour-id={TOUR_ANCHORS.closureDrawer.saveButton}
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Add closure
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
