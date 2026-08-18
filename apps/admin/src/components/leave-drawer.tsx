"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createLeave,
  fetchAffectedByLeave,
  type AffectedAppointment,
  type StaffMember,
} from "../lib/api-client";
import { formatTime, todayLocalDate } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

/**
 * Book time off, and say what it collides with first.
 *
 * Creating leave never cancels anything — nothing in this system destroys a
 * customer's booking as a side effect of an admin edit. That is the right
 * behaviour, but it means an operator can strand three customers without ever
 * being told, so the collisions are named before the button is pressed.
 */
export function LeaveDrawer({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [startDate, setStartDate] = useState(todayLocalDate());
  const [endDate, setEndDate] = useState(todayLocalDate());
  const [reason, setReason] = useState("");
  const [affected, setAffected] = useState<AffectedAppointment[]>([]);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeValid = Boolean(staffId) && endDate >= startDate;

  // Re-check whenever the range changes, with a staleness guard so a slower
  // earlier response cannot overwrite the answer for the current dates.
  useEffect(() => {
    if (!rangeValid) {
      setAffected([]);
      return;
    }
    let stale = false;
    setChecking(true);
    fetchAffectedByLeave(staffId, startDate, endDate)
      .then((rows) => {
        if (!stale) {
          setAffected(rows);
        }
      })
      .catch(() => {
        if (!stale) {
          setAffected([]);
        }
      })
      .finally(() => {
        if (!stale) {
          setChecking(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [staffId, startDate, endDate, rangeValid]);

  async function save(): Promise<void> {
    if (!rangeValid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLeave(staffId, {
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not add this leave.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Add leave" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Stylist</span>
          <select
            data-testid="leave-staff"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          >
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">From</span>
            <input
              data-testid="leave-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">To</span>
            <input
              data-testid="leave-end"
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Reason <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="leave-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <div role="status" aria-live="polite">
          {checking ? (
            <p className="text-xs text-slate-500">Checking for bookings in this period…</p>
          ) : affected.length > 0 ? (
            <div
              data-testid="leave-collisions"
              className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-semibold">
                {affected.length} appointment{affected.length === 1 ? "" : "s"} already booked in
                this period
              </p>
              <ul className="mt-1.5 list-disc pl-5 text-xs">
                {affected.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    {a.appointmentDate} at {formatTime(a.startTime)} —{" "}
                    {a.customerName ?? a.bookingReference}
                  </li>
                ))}
              </ul>
              {affected.length > 6 ? (
                <p className="mt-1 text-xs">…and {affected.length - 6} more.</p>
              ) : null}
              <p className="mt-2 text-xs">
                Adding leave will <strong>not</strong> cancel these. Contact each customer and
                reschedule or cancel from the day board.
              </p>
            </div>
          ) : rangeValid ? (
            <p className="text-xs text-slate-500">No bookings in this period.</p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="leave-save"
            onClick={() => void save()}
            disabled={!rangeValid || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              {affected.length > 0 ? "Add leave anyway" : "Add leave"}
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
