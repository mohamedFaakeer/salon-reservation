"use client";

import { todayLocalDate } from "../../lib/format";
import { TOUR_ANCHORS } from "../../lib/tour-anchors";

/**
 * The one control that governs every panel.
 *
 * Sticky, because the screen is a dozen panels tall and being unsure which
 * period you are reading is the single thing that makes a report worthless.
 *
 * The presets are computed here rather than on the server because they are
 * shorthand for a date pair, not a business rule — the server still resolves
 * and validates whatever it is sent, and it owns what "today" means.
 */

export interface DateRange {
  from: string;
  to: string;
}

interface Preset {
  label: string;
  of: (today: string) => DateRange;
}

const PRESETS: Preset[] = [
  { label: "Today", of: (t) => ({ from: t, to: t }) },
  // Inclusive of today, so "last 7 days" is a week ending now rather than a
  // week ending yesterday — which is what someone at the desk means by it.
  { label: "Last 7 days", of: (t) => ({ from: shift(t, -6), to: t }) },
  { label: "This month", of: (t) => ({ from: monthStart(t), to: t }) },
  {
    label: "Last month",
    of: (t) => {
      const end = shift(monthStart(t), -1);
      return { from: monthStart(end), to: end };
    },
  },
];

export function defaultRange(): DateRange {
  const today = todayLocalDate();
  return { from: today, to: today };
}

export function RangeBar({
  range,
  onChange,
  busy,
}: {
  range: DateRange;
  onChange: (next: DateRange) => void;
  busy: boolean;
}) {
  const today = todayLocalDate();
  const activeLabel = PRESETS.find((p) => sameRange(p.of(today), range))?.label ?? null;
  const invalid = range.to < range.from;

  return (
    <div
      className="sticky top-0 z-10 my-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/90 p-2.5 backdrop-blur"
      data-tour-id={TOUR_ANCHORS.reports.rangeBar}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {PRESETS.map((preset) => {
          const active = activeLabel === preset.label;
          return (
            <button
              key={preset.label}
              type="button"
              data-testid={`report-preset-${preset.label.replace(/\s+/g, "-").toLowerCase()}`}
              aria-pressed={active}
              onClick={() => onChange(preset.of(today))}
              className={`min-h-11 rounded-md border px-3 text-[13px] font-medium transition-colors ${
                active
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2 text-[13px] text-slate-500">
        <label className="sr-only" htmlFor="report-from">
          From
        </label>
        <input
          id="report-from"
          data-testid="report-from"
          type="date"
          value={range.from}
          max={range.to}
          onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
          className="min-h-11 rounded-md border border-slate-200 px-2.5 text-[13px] text-slate-900 tabular"
        />
        <span>to</span>
        <label className="sr-only" htmlFor="report-to">
          To
        </label>
        <input
          id="report-to"
          data-testid="report-to"
          type="date"
          value={range.to}
          min={range.from}
          onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
          className="min-h-11 rounded-md border border-slate-200 px-2.5 text-[13px] text-slate-900 tabular"
        />
        {/* The only motion on this screen: it says the numbers are refreshing,
            which is the one thing worth animating on a surface people work in. */}
        <span aria-hidden="true" className={busy ? "opacity-100" : "opacity-0"}>
          <span className="motion-spin block h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-teal-600" />
        </span>
      </div>

      {invalid ? (
        <p role="alert" className="w-full text-xs text-red-600">
          The end date must be on or after the start date.
        </p>
      ) : null}
    </div>
  );
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
