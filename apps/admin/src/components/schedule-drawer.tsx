"use client";

import { useState } from "react";
import {
  ApiRequestError,
  createSchedule,
  deleteSchedule,
  updateSchedule,
  type StaffMember,
  type WorkingSchedule,
} from "../lib/api-client";
import { WEEKDAY_NAMES, minutesToTime, timeToMinutes } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

/**
 * Edit one stylist's hours for one weekday.
 *
 * A day with no schedule row simply isn't worked — the engine already reasons
 * that way, so there is no separate "day off" state to create here. Clearing a
 * day deletes its row rather than storing an empty one, which would be a
 * second source of truth for the same fact.
 */
export function ScheduleDrawer({
  member,
  dayOfWeek,
  existing,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  dayOfWeek: number;
  existing?: WorkingSchedule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(dayOfWeek);
  const [start, setStart] = useState(existing ? minutesToTime(existing.startMin) : "09:00");
  const [end, setEnd] = useState(existing ? minutesToTime(existing.endMin) : "18:00");
  const [hasBreak, setHasBreak] = useState(existing?.breakStartMin != null);
  const [breakStart, setBreakStart] = useState(
    existing?.breakStartMin != null ? minutesToTime(existing.breakStartMin) : "12:30",
  );
  const [breakEnd, setBreakEnd] = useState(
    existing?.breakEndMin != null ? minutesToTime(existing.breakEndMin) : "13:30",
  );
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const bStart = timeToMinutes(breakStart);
  const bEnd = timeToMinutes(breakEnd);

  const timesValid =
    startMin !== null && endMin !== null && endMin > startMin &&
    (!hasBreak ||
      (bStart !== null && bEnd !== null && bEnd > bStart && bStart >= startMin && bEnd <= endMin));

  function validationMessage(): string | null {
    if (startMin === null || endMin === null) {
      return "Enter times as HH:MM, for example 09:00.";
    }
    if (endMin <= startMin) {
      return "The end of the day must be after the start.";
    }
    if (hasBreak) {
      if (bStart === null || bEnd === null) {
        return "Enter break times as HH:MM.";
      }
      if (bEnd <= bStart) {
        return "The break must end after it starts.";
      }
      if (bStart < startMin || bEnd > endMin) {
        return "The break has to fall inside the working day.";
      }
    }
    return null;
  }

  async function save(): Promise<void> {
    if (!timesValid || startMin === null || endMin === null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const times = {
        startMin,
        endMin,
        breakStartMin: hasBreak ? bStart : null,
        breakEndMin: hasBreak ? bEnd : null,
      };
      if (existing) {
        await updateSchedule(existing.id, times);
      } else {
        await createSchedule({ staffId: member.id, dayOfWeek: day, ...times });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save these hours.");
    } finally {
      setSubmitting(false);
    }
  }

  async function clearDay(): Promise<void> {
    if (!existing) {
      onClose();
      return;
    }
    setClearing(true);
    setError(null);
    try {
      await deleteSchedule(existing.id);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not clear this day.");
    } finally {
      setClearing(false);
    }
  }

  const problem = validationMessage();

  return (
    <DrawerShell title={`${member.name} · ${WEEKDAY_NAMES[day]}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!existing ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Day</span>
            <select
              data-testid="schedule-day"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            >
              {WEEKDAY_NAMES.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Starts</span>
            <input
              data-testid="schedule-start"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Ends</span>
            <input
              data-testid="schedule-end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            data-testid="schedule-has-break"
            checked={hasBreak}
            onChange={(e) => setHasBreak(e.target.checked)}
          />
          Has a break
        </label>

        {hasBreak ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Break from</span>
              <input
                data-testid="schedule-break-start"
                type="time"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Break to</span>
              <input
                data-testid="schedule-break-end"
                type="time"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
            </label>
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          Changing hours never moves an existing booking. Anything already booked outside the new
          window stays exactly as it is.
        </p>

        {problem && (start !== "" || end !== "") ? (
          <p className="text-xs text-amber-800">{problem}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="schedule-save"
            onClick={() => void save()}
            disabled={!timesValid || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Save {WEEKDAY_NAMES[day]}
            </BusyLabel>
          </button>
          {existing ? (
            <button
              type="button"
              data-testid="schedule-clear"
              onClick={() => void clearDay()}
              disabled={clearing}
              className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <BusyLabel busy={clearing} busyText="Clearing…">
                Clear day
              </BusyLabel>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </DrawerShell>
  );
}
