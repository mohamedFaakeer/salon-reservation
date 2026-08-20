"use client";

import { todayLocalDate } from "../lib/format";

/**
 * The period the dashboard is describing.
 *
 * Presets lead because the ranges an owner actually asks for are the same five
 * every time, and typing two dates to see "this week" is friction for the
 * common case. The two date fields stay visible underneath for the times it is
 * a real question — a specific Poya weekend, last month's payout period.
 *
 * Everything here is display state. The server computes the totals and rejects
 * a backwards or oversized range; this only decides what to ask for.
 */

export interface DateRange {
  from: string;
  to: string;
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday-start, matching the rota's Mon=0 convention everywhere else. */
function startOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return shift(date, -((d.getUTCDay() + 6) % 7));
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function presetRanges(): Array<{ id: string; label: string; range: DateRange }> {
  const today = todayLocalDate();
  const monthStart = startOfMonth(today);
  const lastMonthEnd = shift(monthStart, -1);
  return [
    { id: "today", label: "Today", range: { from: today, to: today } },
    { id: "yesterday", label: "Yesterday", range: { from: shift(today, -1), to: shift(today, -1) } },
    { id: "week", label: "This week", range: { from: startOfWeek(today), to: today } },
    { id: "month", label: "This month", range: { from: monthStart, to: today } },
    {
      id: "last-month",
      label: "Last month",
      range: { from: startOfMonth(lastMonthEnd), to: lastMonthEnd },
    },
  ];
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const presets = presetRanges();
  const activePreset = presets.find(
    (p) => p.range.from === value.from && p.range.to === value.to,
  );
  const invalid = value.to < value.from;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick date ranges">
        {presets.map((preset) => {
          const active = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`range-${preset.id}`}
              onClick={() => onChange(preset.range)}
              aria-pressed={active}
              className={`min-h-11 rounded-full px-3.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-teal-600 text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          From
          <input
            type="date"
            data-testid="range-from"
            value={value.from}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          To
          <input
            type="date"
            data-testid="range-to"
            value={value.to}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>
        {invalid ? (
          <p role="alert" className="pb-3 text-xs font-medium text-red-700">
            The end date has to be on or after the start.
          </p>
        ) : null}
      </div>
    </div>
  );
}
