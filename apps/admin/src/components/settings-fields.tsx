"use client";

import type { ReactNode } from "react";

/**
 * Presentational primitives for the Settings page.
 *
 * Settings is the one screen where a wrong value is silent: nothing errors,
 * the salon just quietly starts refunding 0% or refusing same-day bookings.
 * So every field here carries its unit in the label, its bounds in the hint,
 * and reads back what it will actually do — the numbers alone don't say.
 */

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </header>
      <div className="flex flex-col gap-4 px-4 py-4">{children}</div>
    </section>
  );
}

/** A read-only fact the operator can't change here but needs to see. */
export function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
        {label}
      </span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  optional = false,
  disabled = false,
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  placeholder?: string;
  optional?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {optional ? <span className="font-normal text-slate-500"> (optional)</span> : null}
      </span>
      <input
        data-testid={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="min-h-11 rounded border border-slate-300 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-500"
      />
      {hint ? (
        <span id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * A bounded whole number. Kept as a string so a half-typed value ("" while
 * retyping, "1" on the way to "15") doesn't get coerced to something the
 * operator never meant; the page validates before anything is sent.
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  unit,
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  min: number;
  max: number;
  unit: string;
  hint?: string;
  disabled?: boolean;
}) {
  const invalid = !isWholeNumberWithin(value, min, max);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <input
          data-testid={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="numeric"
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          className="min-h-11 w-24 rounded border border-slate-300 px-3 text-sm tabular disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-500"
        />
        <span className="text-sm text-slate-600">{unit}</span>
      </span>
      <span
        id={`${id}-hint`}
        className={invalid ? "text-xs font-medium text-red-700" : "text-xs text-slate-500"}
      >
        {invalid ? `Enter a whole number from ${min} to ${max}.` : (hint ?? `${min}–${max}`)}
      </span>
    </label>
  );
}

export function isWholeNumberWithin(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) {
    return false;
  }
  const n = Number(value);
  return n >= min && n <= max;
}
