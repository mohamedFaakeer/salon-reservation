"use client";

import { useState } from "react";
import { isWholeNumberWithin } from "./settings-fields";

/**
 * When reminders go out, as hours before the appointment.
 *
 * Stored as a bare array of numbers, which reads as data rather than as a
 * schedule, so each entry is shown as the sentence it stands for and the list
 * is kept in the order the customer will experience it — furthest out first.
 */

const MAX_REMINDERS = 5;
const MIN_HOURS = 1;
const MAX_HOURS = 720;

function describe(hours: number): string {
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  return `${hours} hours before`;
}

export function ReminderOffsetsField({
  offsets,
  onChange,
  disabled = false,
}: {
  offsets: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const full = offsets.length >= MAX_REMINDERS;
  const draftValid = isWholeNumberWithin(draft, MIN_HOURS, MAX_HOURS);
  const duplicate = draftValid && offsets.includes(Number(draft));

  function add(): void {
    if (!draftValid || duplicate || full) {
      return;
    }
    onChange([...offsets, Number(draft)].sort((a, b) => b - a));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-700">Reminder times</span>

      {offsets.length === 0 ? (
        <p className="text-sm text-slate-500">
          No reminders — customers hear nothing between booking and the appointment.
        </p>
      ) : (
        <ul data-testid="reminder-list" className="flex flex-wrap gap-2">
          {offsets.map((hours) => (
            <li
              key={hours}
              className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 py-1 pl-3 pr-1 text-sm text-slate-800"
            >
              <span className="tabular">{describe(hours)}</span>
              {!disabled ? (
                <button
                  type="button"
                  data-testid={`remove-reminder-${hours}`}
                  onClick={() => onChange(offsets.filter((h) => h !== hours))}
                  aria-label={`Remove the reminder ${describe(hours)}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true" focusable="false">
                    <path
                      d="m4 4 8 8M12 4l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              data-testid="reminder-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              inputMode="numeric"
              placeholder="24"
              aria-label="Hours before the appointment"
              aria-invalid={draft.length > 0 && !draftValid}
              disabled={full}
              className="min-h-11 w-24 rounded border border-slate-300 px-3 text-sm tabular disabled:bg-slate-50 aria-invalid:border-red-500"
            />
            <span className="text-sm text-slate-600">hours before</span>
            <button
              type="button"
              data-testid="add-reminder"
              onClick={add}
              disabled={!draftValid || duplicate || full}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Add reminder
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {full
              ? `That's the limit of ${MAX_REMINDERS}. Remove one to add another.`
              : duplicate
                ? "There's already a reminder at that time."
                : `${MIN_HOURS}–${MAX_HOURS} hours (up to 30 days). ${MAX_REMINDERS - offsets.length} left.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
