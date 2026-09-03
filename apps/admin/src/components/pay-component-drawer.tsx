"use client";

import { useEffect, useState } from "react";
import {
  deactivatePayComponent,
  fetchPayComponents,
  upsertPayComponent,
  PAY_COMPONENT_KIND,
  PAY_COMPONENT_LABEL,
  type PayComponentType,
  type PayComponentView,
  type StaffMember,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";
import { formatPriceCents } from "../lib/format";

const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

function rupeesToCents(input: string): number {
  return Math.round(Number(input) * 100);
}

const ALLOWANCE_TYPES: PayComponentType[] = ["TRANSPORT", "MEAL", "ATTENDANCE", "PHONE", "UNIFORM", "COST_OF_LIVING"];
const DEDUCTION_TYPES: PayComponentType[] = ["SALARY_ADVANCE_RECOVERY", "LOAN_REPAYMENT", "UNIFORM_EQUIPMENT_RECOVERY", "OTHER_DEDUCTION"];

/**
 * Manages one staff member's recurring allowances/deductions, from the
 * fixed list (DECISIONS.md §69) — one active assignment per type, so the
 * "add" form only ever offers types not already assigned; changing an
 * amount is a new assignment that quietly supersedes the old one server-side.
 */
export function PayComponentDrawer({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const toast = useToast();
  const [components, setComponents] = useState<PayComponentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<PayComponentType>("TRANSPORT");
  const [amountRupees, setAmountRupees] = useState("");
  const [epfApplicable, setEpfApplicable] = useState(false);
  const [etfApplicable, setEtfApplicable] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load(): void {
    setLoading(true);
    fetchPayComponents(staff.id)
      .then((rows) => setComponents(rows.filter((r) => r.active)))
      .catch(() => setComponents([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [staff.id]);

  const assignedTypes = new Set(components.map((c) => c.type));
  const availableAllowances = ALLOWANCE_TYPES.filter((t) => !assignedTypes.has(t));
  const availableDeductions = DEDUCTION_TYPES.filter((t) => !assignedTypes.has(t));
  const availableTypes = [...availableAllowances, ...availableDeductions];

  const amountValid = RUPEE_PATTERN.test(amountRupees) && Number(amountRupees) > 0;
  const reasonValid = type !== "OTHER_DEDUCTION" || reason.trim().length >= 3;
  const canSubmit = amountValid && reasonValid;

  function startAdding(): void {
    setType(availableTypes[0] ?? "TRANSPORT");
    setAmountRupees("");
    setEpfApplicable(false);
    setEtfApplicable(false);
    setReason("");
    setAdding(true);
  }

  async function save(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await upsertPayComponent(staff.id, {
        type,
        amountCents: rupeesToCents(amountRupees),
        epfApplicable: PAY_COMPONENT_KIND[type] === "ALLOWANCE" ? epfApplicable : undefined,
        etfApplicable: PAY_COMPONENT_KIND[type] === "ALLOWANCE" ? etfApplicable : undefined,
        reason: type === "OTHER_DEDUCTION" ? reason.trim() : undefined,
      });
      toast.success(`${PAY_COMPONENT_LABEL[type]} added`);
      setAdding(false);
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setRemovingId(id);
    try {
      await deactivatePayComponent(id);
      toast.success("Removed");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <DrawerShell title={`${staff.name}'s allowances & deductions`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Applies to every payroll run computed while active, until removed or changed.
        </p>

        {loading ? (
          <div className="skeleton h-20 rounded-lg" />
        ) : components.length === 0 && !adding ? (
          <p className="text-sm text-slate-400">Nothing assigned yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100 rounded border border-slate-200">
            {components.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{PAY_COMPONENT_LABEL[c.type]}</p>
                  <p className="text-xs text-slate-400">
                    {c.kind === "ALLOWANCE"
                      ? [c.epfApplicable ? "EPF-applicable" : null, c.etfApplicable ? "ETF-applicable" : null].filter(Boolean).join(", ") ||
                        "Not EPF/ETF-applicable"
                      : c.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`tabular text-sm font-semibold ${c.kind === "DEDUCTION" ? "text-red-600" : "text-slate-900"}`}>
                    {c.kind === "DEDUCTION" ? "−" : "+"}
                    {formatPriceCents(c.amountCents)}
                  </span>
                  <button
                    type="button"
                    disabled={removingId === c.id}
                    onClick={() => void remove(c.id)}
                    aria-label={`Remove ${PAY_COMPONENT_LABEL[c.type]}`}
                    className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PayComponentType)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              >
                {availableAllowances.length > 0 ? (
                  <optgroup label="Allowances">
                    {availableAllowances.map((t) => (
                      <option key={t} value={t}>
                        {PAY_COMPONENT_LABEL[t]}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {availableDeductions.length > 0 ? (
                  <optgroup label="Deductions">
                    {availableDeductions.map((t) => (
                      <option key={t} value={t}>
                        {PAY_COMPONENT_LABEL[t]}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Amount (Rs.)</span>
              <input
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                inputMode="decimal"
                aria-invalid={amountRupees.length > 0 && !amountValid}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
            </label>

            {PAY_COMPONENT_KIND[type] === "ALLOWANCE" ? (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={epfApplicable} onChange={(e) => setEpfApplicable(e.target.checked)} className="h-4 w-4" />
                  Counts toward EPF
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={etfApplicable} onChange={(e) => setEtfApplicable(e.target.checked)} className="h-4 w-4" />
                  Counts toward ETF
                </label>
                <p className="text-xs text-slate-400">
                  Off by default — only applies once your salon&apos;s statutory calculations are also turned on.
                </p>
              </div>
            ) : null}

            {type === "OTHER_DEDUCTION" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Reason</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Damaged equipment, agreed 12 Sep 2026"
                  aria-invalid={reason.length > 0 && !reasonValid}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm"
                />
              </label>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={() => void save()}
                className="min-h-10 rounded bg-teal-600 px-3.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <BusyLabel busy={submitting} busyText="Saving…">
                  Add
                </BusyLabel>
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="min-h-10 rounded border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : availableTypes.length > 0 ? (
          <button
            type="button"
            onClick={startAdding}
            className="min-h-11 w-fit rounded border border-teal-600 px-3.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            + Add allowance or deduction
          </button>
        ) : (
          <p className="text-xs text-slate-400">Every type on the list is already assigned.</p>
        )}
      </div>
    </DrawerShell>
  );
}
