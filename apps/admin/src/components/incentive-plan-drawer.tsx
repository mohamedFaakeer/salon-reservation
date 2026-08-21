"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createIncentivePlan,
  fetchServices,
  updateIncentivePlan,
  type IncentivePlanView,
  type ServiceItem,
  type UpsertIncentivePlanInput,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { errorCopy } from "../lib/error-copy";

/**
 * Create/edit an incentive plan.
 *
 * Each of the three ways a plan can pay — base commission, a flat amount per
 * job, a bonus once a monthly target is cleared — is its own on/off switch
 * rather than one dense form, so a plan reads as a short list of yes/no
 * decisions plus the numbers for whichever are on. They compose freely: a
 * senior stylist can carry all three at once.
 */

const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

function rupeesToCents(input: string): number {
  return Math.round(Number(input) * 100);
}

function centsToRupees(cents: number): string {
  return String(cents / 100);
}

export function IncentivePlanDrawer({
  plan,
  onClose,
  onSaved,
}: {
  /** Omit to create. */
  plan?: IncentivePlanView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(plan);
  const toast = useToast();

  const [name, setName] = useState(plan?.name ?? "");

  const [commissionOn, setCommissionOn] = useState(plan?.baseCommissionPercent !== null && plan !== undefined);
  const [commissionPercent, setCommissionPercent] = useState(
    plan?.baseCommissionPercent !== null && plan?.baseCommissionPercent !== undefined
      ? String(plan.baseCommissionPercent)
      : "",
  );
  const [rates, setRates] = useState<Array<{ serviceId: string; ratePercent: string }>>(
    plan?.serviceRates.map((r) => ({ serviceId: r.serviceId, ratePercent: String(r.ratePercent) })) ?? [],
  );

  const [perJobOn, setPerJobOn] = useState(plan?.perJobAmountCents !== null && plan !== undefined);
  const [perJobRupees, setPerJobRupees] = useState(
    plan?.perJobAmountCents !== null && plan?.perJobAmountCents !== undefined
      ? centsToRupees(plan.perJobAmountCents)
      : "",
  );

  const [tierOn, setTierOn] = useState(plan?.monthlyTargetCents !== null && plan !== undefined);
  const [targetRupees, setTargetRupees] = useState(
    plan?.monthlyTargetCents !== null && plan?.monthlyTargetCents !== undefined
      ? centsToRupees(plan.monthlyTargetCents)
      : "",
  );
  const [tierPercent, setTierPercent] = useState(
    plan?.tierBonusPercent !== null && plan?.tierBonusPercent !== undefined ? String(plan.tierBonusPercent) : "",
  );

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  const commissionValid = !commissionOn || (/^\d+$/.test(commissionPercent) && Number(commissionPercent) <= 100);
  const perJobValid = !perJobOn || RUPEE_PATTERN.test(perJobRupees);
  const tierValid =
    !tierOn || (RUPEE_PATTERN.test(targetRupees) && /^\d+$/.test(tierPercent) && Number(tierPercent) <= 100);
  const ratesValid = rates.every((r) => r.serviceId && /^\d+$/.test(r.ratePercent) && Number(r.ratePercent) <= 100);
  const canSubmit =
    name.trim().length >= 2 &&
    (commissionOn || perJobOn || tierOn) &&
    commissionValid &&
    perJobValid &&
    tierValid &&
    ratesValid;

  const availableServices = services.filter((s) => !rates.some((r) => r.serviceId === s.id));

  function addRate(): void {
    const first = availableServices[0];
    if (!first) return;
    setRates([...rates, { serviceId: first.id, ratePercent: "" }]);
  }

  function updateRate(index: number, patch: Partial<{ serviceId: string; ratePercent: string }>): void {
    setRates(rates.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRate(index: number): void {
    setRates(rates.filter((_, i) => i !== index));
  }

  async function save(): Promise<void> {
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: UpsertIncentivePlanInput = {
        name: name.trim(),
        ...(commissionOn ? { baseCommissionPercent: Number(commissionPercent) } : {}),
        ...(perJobOn ? { perJobAmountCents: rupeesToCents(perJobRupees) } : {}),
        ...(tierOn
          ? { monthlyTargetCents: rupeesToCents(targetRupees), tierBonusPercent: Number(tierPercent) }
          : {}),
        ...(commissionOn && rates.length > 0
          ? { serviceRates: rates.map((r) => ({ serviceId: r.serviceId, ratePercent: Number(r.ratePercent) })) }
          : {}),
      };
      await (plan ? updateIncentivePlan(plan.id, payload) : createIncentivePlan(payload));
      toast.success(plan ? `${payload.name} updated` : `${payload.name} created`);
      onSaved();
    } catch (err) {
      const copy = errorCopy(err);
      setError(copy.title);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={editing ? "Edit incentive plan" : "New incentive plan"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Plan name</span>
          <input
            data-testid="plan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Senior stylist commission"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <ComponentCard
          testId="commission"
          name="Base commission"
          on={commissionOn}
          onToggle={() => setCommissionOn(!commissionOn)}
          offHint="Off — this plan does not pay a percentage of collections."
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Percent of collections</span>
            <input
              data-testid="commission-percent"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              inputMode="numeric"
              aria-invalid={commissionPercent.length > 0 && !commissionValid}
              className="min-h-11 w-24 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Rate overrides by service <span className="font-normal normal-case text-slate-400">(optional)</span>
            </p>
            <div className="flex flex-col gap-1.5">
              {rates.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={r.serviceId}
                    onChange={(e) => updateRate(i, { serviceId: e.target.value })}
                    className="min-h-9 flex-1 rounded border border-slate-300 px-2 text-xs"
                  >
                    <option value={r.serviceId}>
                      {services.find((s) => s.id === r.serviceId)?.name ?? "Select a service"}
                    </option>
                    {availableServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={r.ratePercent}
                    onChange={(e) => updateRate(i, { ratePercent: e.target.value })}
                    inputMode="numeric"
                    placeholder="%"
                    aria-invalid={r.ratePercent.length > 0 && !/^\d+$/.test(r.ratePercent)}
                    className="min-h-9 w-14 rounded border border-slate-300 px-2 text-xs tabular"
                  />
                  <button
                    type="button"
                    onClick={() => removeRate(i)}
                    aria-label="Remove this override"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {availableServices.length > 0 ? (
              <button
                type="button"
                onClick={addRate}
                className="mt-1.5 text-xs font-semibold text-teal-700 hover:underline"
              >
                + Add a service override
              </button>
            ) : null}
          </div>
        </ComponentCard>

        <ComponentCard
          testId="per-job"
          name="Flat per job"
          on={perJobOn}
          onToggle={() => setPerJobOn(!perJobOn)}
          offHint="Off — this plan does not pay a flat amount per completed job."
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Amount per completed job (Rs.)</span>
            <input
              data-testid="per-job-amount"
              value={perJobRupees}
              onChange={(e) => setPerJobRupees(e.target.value)}
              inputMode="decimal"
              aria-invalid={perJobRupees.length > 0 && !perJobValid}
              className="min-h-11 w-32 rounded border border-slate-300 px-3 text-sm tabular"
            />
          </label>
        </ComponentCard>

        <ComponentCard
          testId="tier"
          name="Monthly target bonus"
          on={tierOn}
          onToggle={() => setTierOn(!tierOn)}
          offHint="Off — no bonus for clearing a monthly figure."
        >
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Target (Rs.)</span>
              <input
                data-testid="tier-target"
                value={targetRupees}
                onChange={(e) => setTargetRupees(e.target.value)}
                inputMode="decimal"
                aria-invalid={targetRupees.length > 0 && !RUPEE_PATTERN.test(targetRupees)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Bonus rate</span>
              <input
                data-testid="tier-percent"
                value={tierPercent}
                onChange={(e) => setTierPercent(e.target.value)}
                inputMode="numeric"
                aria-invalid={tierPercent.length > 0 && !/^\d+$/.test(tierPercent)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
              />
            </label>
          </div>
          {tierOn && RUPEE_PATTERN.test(targetRupees) && /^\d+$/.test(tierPercent) ? (
            <p className="mt-1.5 text-xs text-slate-500">
              {tierPercent}% on whatever is collected past Rs. {Number(targetRupees).toLocaleString("en-LK")} in the
              period.
            </p>
          ) : null}
        </ComponentCard>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            data-testid="plan-save"
            onClick={() => void save()}
            disabled={!canSubmit || submitting}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              {editing ? "Save plan" : "Create plan"}
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

function ComponentCard({
  testId,
  name,
  on,
  onToggle,
  offHint,
  children,
}: {
  testId: string;
  name: string;
  on: boolean;
  onToggle: () => void;
  offHint: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{name}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Turn ${name.toLowerCase()} ${on ? "off" : "on"}`}
          data-testid={`toggle-${testId}`}
          onClick={onToggle}
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-teal-600" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      {on ? children : <p className="text-xs text-slate-400">{offHint}</p>}
    </div>
  );
}
