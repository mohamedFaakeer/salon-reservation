"use client";

import { useState } from "react";
import type { DiscountWindow, ServiceDiscountView } from "../lib/api-client";
import { formatPriceCents, minutesToTime, timeToMinutes, WEEKDAYS } from "../lib/format";

/**
 * The offer on a service: how much, between which dates, during which hours.
 *
 * Five inputs that only mean anything together, which is why the preview says
 * the whole thing back in one sentence. A mis-set 20% that was meant to be
 * LKR 20 is obvious there, before it is saved — not after a customer has been
 * quoted it.
 *
 * Hours default to all day, because that is the offer most salons actually
 * run ("20% off this September"), and the case that needs no configuration
 * should not have to be configured.
 */

export type OfferMode = "NONE" | "PERCENT" | "FIXED";

export interface OfferDraft {
  mode: OfferMode;
  /** Percent as typed; rupees as typed. Converted to cents on the way out. */
  value: string;
  startDate: string;
  endDate: string;
  label: string;
  allDay: boolean;
  windows: DiscountWindow[];
}

const DEFAULT_START_MIN = 17 * 60;
const DEFAULT_END_MIN = 20 * 60;

export function draftFromDiscount(discount: ServiceDiscountView | null | undefined): OfferDraft {
  const today = new Date().toISOString().slice(0, 10);
  if (!discount) {
    return {
      mode: "NONE",
      value: "",
      startDate: today,
      endDate: today,
      label: "",
      allDay: true,
      windows: [],
    };
  }
  return {
    mode: discount.type === "PERCENT" ? "PERCENT" : "FIXED",
    value: discount.type === "PERCENT" ? String(discount.value) : String(discount.value / 100),
    startDate: discount.startDate,
    endDate: discount.endDate,
    label: discount.label ?? "",
    allDay: discount.windows.length === 0,
    windows: discount.windows,
  };
}

/** Cents for a fixed offer, whole percent for a proportional one. */
export function draftValueForApi(draft: OfferDraft): number {
  return draft.mode === "PERCENT" ? Number(draft.value) : Math.round(Number(draft.value) * 100);
}

export function draftIsValid(draft: OfferDraft, priceCents: number): boolean {
  if (draft.mode === "NONE") {
    return true;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(draft.value) || Number(draft.value) <= 0) {
    return false;
  }
  if (draft.mode === "PERCENT" && Number(draft.value) > 100) {
    return false;
  }
  if (draft.mode === "FIXED" && draftValueForApi(draft) > priceCents) {
    return false;
  }
  if (draft.endDate < draft.startDate) {
    return false;
  }
  if (!draft.allDay) {
    if (draft.windows.length === 0) {
      return false;
    }
    if (draft.windows.some((w) => w.endMin <= w.startMin)) {
      return false;
    }
  }
  return true;
}

/** What the offer takes off a given price, mirroring the server's own rule. */
export function draftDiscountCents(draft: OfferDraft, priceCents: number): number {
  if (draft.mode === "NONE" || !/^\d+(\.\d{1,2})?$/.test(draft.value)) {
    return 0;
  }
  const raw =
    draft.mode === "PERCENT"
      ? Math.round((priceCents * Number(draft.value)) / 100)
      : draftValueForApi(draft);
  return Math.max(0, Math.min(raw, priceCents));
}

export function OfferEditor({
  draft,
  onChange,
  priceCents,
}: {
  draft: OfferDraft;
  onChange: (next: OfferDraft) => void;
  priceCents: number;
}) {
  const set = (patch: Partial<OfferDraft>): void => onChange({ ...draft, ...patch });
  const [lastDay, setLastDay] = useState(1);

  if (draft.mode === "NONE") {
    return (
      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4">
        <ModeSwitch draft={draft} onChange={onChange} />
        <p className="text-xs text-slate-500">
          No offer. Customers see the full price.
        </p>
      </section>
    );
  }

  const activeDays = [...new Set(draft.windows.map((w) => w.dayOfWeek))].sort((a, b) => a - b);

  function toggleDay(day: number): void {
    if (activeDays.includes(day)) {
      set({ windows: draft.windows.filter((w) => w.dayOfWeek !== day) });
      return;
    }
    setLastDay(day);
    set({
      windows: [
        ...draft.windows,
        { dayOfWeek: day, startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN },
      ].sort(byDayThenStart),
    });
  }

  function patchWindow(index: number, patch: Partial<DiscountWindow>): void {
    set({ windows: draft.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  }

  return (
    <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
      <ModeSwitch draft={draft} onChange={onChange} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Take off</span>
        <span className="flex">
          {draft.mode === "FIXED" ? (
            <span className="flex min-h-11 items-center rounded-l border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-500">
              Rs.
            </span>
          ) : null}
          <input
            data-testid="offer-value"
            value={draft.value}
            onChange={(e) => set({ value: e.target.value })}
            inputMode="decimal"
            aria-invalid={draft.value.length > 0 && !draftIsValid(draft, priceCents)}
            className={`min-h-11 flex-1 border border-slate-300 px-3 text-sm tabular aria-invalid:border-red-500 ${
              draft.mode === "FIXED" ? "rounded-r" : "rounded-l"
            }`}
          />
          {draft.mode === "PERCENT" ? (
            <span className="flex min-h-11 items-center rounded-r border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-500">
              %
            </span>
          ) : null}
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From</span>
          <input
            data-testid="offer-start"
            type="date"
            value={draft.startDate}
            max={draft.endDate}
            onChange={(e) => e.target.value && set({ startDate: e.target.value })}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Until</span>
          <input
            data-testid="offer-end"
            type="date"
            value={draft.endDate}
            min={draft.startDate}
            onChange={(e) => e.target.value && set({ endDate: e.target.value })}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-sm font-medium text-slate-700">When it runs</legend>
        <div className="grid grid-cols-2 gap-1.5">
          <Choice
            selected={draft.allDay}
            onSelect={() => set({ allDay: true, windows: [] })}
            testId="offer-all-day"
          >
            All day
          </Choice>
          <Choice
            selected={!draft.allDay}
            onSelect={() =>
              set({
                allDay: false,
                windows: draft.windows.length
                  ? draft.windows
                  : [{ dayOfWeek: lastDay, startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN }],
              })
            }
            testId="offer-chosen-hours"
          >
            Chosen hours
          </Choice>
        </div>

        {draft.allDay ? (
          <p className="text-xs text-slate-500">
            Every day between those dates, whenever you are open.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">Pick the days, then the hours for each.</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, day) => {
                const on = activeDays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    data-testid={`offer-day-${day}`}
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={`min-h-11 min-w-11 rounded border px-2 text-xs font-semibold transition-colors ${
                      on
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-slate-300 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              {draft.windows.map((w, i) => (
                <div
                  key={`${w.dayOfWeek}-${i}`}
                  data-testid={`offer-window-${i}`}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50/60 px-2.5 py-2"
                >
                  <span className="w-8 text-xs font-semibold text-slate-700">
                    {WEEKDAYS[w.dayOfWeek]}
                  </span>
                  <input
                    type="time"
                    value={minutesToTime(w.startMin)}
                    onChange={(e) => {
                      const min = timeToMinutes(e.target.value);
                      if (min !== null) {
                        patchWindow(i, { startMin: min });
                      }
                    }}
                    aria-label={`${WEEKDAYS[w.dayOfWeek]} start`}
                    className="min-h-9 rounded border border-slate-300 px-2 text-sm tabular"
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="time"
                    value={minutesToTime(w.endMin === 1440 ? 1439 : w.endMin)}
                    onChange={(e) => {
                      const min = timeToMinutes(e.target.value);
                      if (min !== null) {
                        patchWindow(i, { endMin: min });
                      }
                    }}
                    aria-label={`${WEEKDAYS[w.dayOfWeek]} end`}
                    aria-invalid={w.endMin <= w.startMin}
                    className="min-h-9 rounded border border-slate-300 px-2 text-sm tabular aria-invalid:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => set({ windows: draft.windows.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${WEEKDAYS[w.dayOfWeek]} window`}
                    className="ml-auto min-h-9 rounded px-2 text-slate-400 hover:bg-white hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                data-testid="offer-add-window"
                onClick={() =>
                  set({
                    windows: [
                      ...draft.windows,
                      { dayOfWeek: lastDay, startMin: DEFAULT_START_MIN, endMin: DEFAULT_END_MIN },
                    ].sort(byDayThenStart),
                  })
                }
                className="min-h-11 w-fit rounded border border-dashed border-slate-300 px-3 text-xs font-medium text-teal-700 hover:bg-teal-50"
              >
                + Add another window
              </button>
            </div>
          </>
        )}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">
          Call it <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input
          data-testid="offer-label"
          value={draft.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="September evenings"
          maxLength={60}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />
        <span className="text-xs text-slate-500">
          Customers see this. Left blank, they just see “
          {draft.mode === "PERCENT" ? `${draft.value || "0"}% off` : "the amount off"}”.
        </span>
      </label>

      <OfferPreview draft={draft} priceCents={priceCents} />
    </section>
  );
}

/**
 * The whole offer in one sentence: the money, the name, the hours, the end
 * date. This is the check that catches a percentage typed where rupees were
 * meant, which the field alone cannot.
 */
function OfferPreview({ draft, priceCents }: { draft: OfferDraft; priceCents: number }) {
  const off = draftDiscountCents(draft, priceCents);

  if (!draftIsValid(draft, priceCents) || off === 0) {
    return (
      <p
        data-testid="offer-preview-invalid"
        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500"
      >
        {draft.mode === "FIXED" && draftValueForApi(draft) > priceCents
          ? "That is more than the service costs."
          : "Fill in the offer to see what customers will pay."}
      </p>
    );
  }

  return (
    <div
      data-testid="offer-preview"
      className="rounded-md border border-teal-100 bg-teal-50 px-3.5 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-slate-500 line-through tabular">{formatPriceCents(priceCents)}</span>
        <span className="text-[19px] font-semibold tracking-[-0.02em] text-teal-900 tabular">
          {formatPriceCents(priceCents - off)}
        </span>
        <span className="text-xs font-semibold text-teal-700 tabular">
          saves {formatPriceCents(off)}
        </span>
      </p>
      <p className="mt-1 text-[12.5px] text-teal-900">{describeOffer(draft)}</p>
    </div>
  );
}

function ModeSwitch({
  draft,
  onChange,
}: {
  draft: OfferDraft;
  onChange: (next: OfferDraft) => void;
}) {
  const options: Array<{ mode: OfferMode; label: string }> = [
    { mode: "NONE", label: "None" },
    { mode: "PERCENT", label: "Percentage" },
    { mode: "FIXED", label: "Fixed amount" },
  ];

  return (
    <fieldset>
      <legend className="pb-1.5 text-sm font-medium text-slate-700">Offer</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((option) => (
          <Choice
            key={option.mode}
            selected={draft.mode === option.mode}
            // Switching between percent and rupees clears the number: 20 means
            // two very different things either side of that toggle.
            onSelect={() => onChange({ ...draft, mode: option.mode, value: "" })}
            testId={`offer-mode-${option.mode}`}
          >
            {option.label}
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

function Choice({
  selected,
  onSelect,
  testId,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-11 rounded border px-2 text-[13px] font-medium transition-colors ${
        selected
          ? "border-teal-600 bg-teal-50 text-teal-800"
          : "border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/** "September evenings · Mon, Tue 5–8pm and Fri 10am–1pm · until 30 Sep". */
export function describeOffer(draft: OfferDraft): string {
  const parts: string[] = [];
  if (draft.label.trim()) {
    parts.push(`“${draft.label.trim()}”`);
  }
  parts.push(draft.allDay ? "any time you are open" : describeWindows(draft.windows));
  parts.push(`until ${formatShortDate(draft.endDate)}`);
  return parts.join(" · ");
}

/**
 * Days sharing the same hours are named together — "Mon, Tue 5–8pm" rather
 * than one clause each, which is how a person would say it out loud.
 */
function describeWindows(windows: DiscountWindow[]): string {
  const byHours = new Map<string, number[]>();
  for (const w of [...windows].sort(byDayThenStart)) {
    const key = `${w.startMin}-${w.endMin}`;
    byHours.set(key, [...(byHours.get(key) ?? []), w.dayOfWeek]);
  }

  const clauses = [...byHours.entries()].map(([key, days]) => {
    const [startMin, endMin] = key.split("-").map(Number);
    return `${days.map((d) => WEEKDAYS[d]).join(", ")} ${shortTime(startMin)}–${shortTime(endMin)}`;
  });

  return clauses.length <= 1
    ? (clauses[0] ?? "no hours chosen")
    : `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`;
}

function shortTime(min: number): string {
  const hour = Math.floor(min / 60) % 24;
  const minute = min % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function byDayThenStart(a: DiscountWindow, b: DiscountWindow): number {
  return a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin;
}
