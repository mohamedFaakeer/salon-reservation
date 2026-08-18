"use client";

import type { AdvanceRuleValue } from "../lib/api-client";
import { NumberField } from "./settings-fields";

/**
 * How much a customer must pay to hold a booking.
 *
 * The four rules read alike as enum names and behave nothing alike, so each
 * option states what the customer is asked for rather than naming the rule.
 * No amount is worked out here: the deposit on a real booking comes from the
 * server's PricingService, and duplicating that arithmetic in the browser is
 * how the two drift apart.
 *
 * The value fields are deliberately separate — the server prices FIXED_AMOUNT
 * from `advanceValueCents` and PERCENTAGE from `advancePercent` — so switching
 * rules must not carry a stale number across.
 */

const OPTIONS: Array<{ value: AdvanceRuleValue; label: string; detail: string }> = [
  {
    value: "NO_ADVANCE",
    label: "Nothing up front",
    detail: "The customer books for free and pays the full amount at the salon.",
  },
  {
    value: "FIXED_AMOUNT",
    label: "A fixed deposit",
    detail: "The same amount on every booking, whatever it costs.",
  },
  {
    value: "PERCENTAGE",
    label: "A share of the total",
    detail: "Scales with the booking — a colour costs more to hold than a trim.",
  },
  {
    value: "FULL_PAYMENT",
    label: "The whole amount",
    detail: "Nothing is owed at the salon. Refunds then follow your policy below.",
  },
];

export function AdvanceRuleField({
  rule,
  onRuleChange,
  fixedRupees,
  onFixedRupeesChange,
  percent,
  onPercentChange,
  disabled = false,
}: {
  rule: AdvanceRuleValue;
  onRuleChange: (next: AdvanceRuleValue) => void;
  fixedRupees: string;
  onFixedRupeesChange: (next: string) => void;
  percent: string;
  onPercentChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="pb-1 text-sm font-medium text-slate-700">
        What the customer pays to book
      </legend>

      {OPTIONS.map((option) => {
        const selected = rule === option.value;
        return (
          <div
            key={option.value}
            className={`rounded border ${
              selected ? "border-teal-500 bg-teal-50/60" : "border-slate-200 bg-white"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-3 p-3">
              <input
                type="radio"
                name="advance-rule"
                data-testid={`advance-${option.value}`}
                value={option.value}
                checked={selected}
                onChange={() => onRuleChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600"
              />
              <span className="flex flex-col gap-0.5">
                <span
                  className={
                    selected ? "text-sm font-semibold text-teal-900" : "text-sm text-slate-800"
                  }
                >
                  {option.label}
                </span>
                <span className={selected ? "text-xs text-teal-800" : "text-xs text-slate-500"}>
                  {option.detail}
                </span>
              </span>
            </label>

            {selected && option.value === "FIXED_AMOUNT" ? (
              <div className="border-t border-teal-200 px-3 py-3">
                <NumberField
                  id="advance-value-rupees"
                  label="Deposit"
                  value={fixedRupees}
                  onChange={onFixedRupeesChange}
                  min={0}
                  max={1_000_000}
                  unit="rupees"
                  hint="In rupees, not cents. Capped at the booking total if it comes to less."
                />
              </div>
            ) : null}

            {selected && option.value === "PERCENTAGE" ? (
              <div className="border-t border-teal-200 px-3 py-3">
                <NumberField
                  id="advance-percent"
                  label="Share of the total"
                  value={percent}
                  onChange={onPercentChange}
                  min={0}
                  max={100}
                  unit="%"
                  hint="Rounded to the nearest rupee on each booking."
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
