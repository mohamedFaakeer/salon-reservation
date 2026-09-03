"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPayrollSettings, updatePayCalendar, type PayrollSettingsView } from "../../../../lib/api-client";
import { errorCopy } from "../../../../lib/error-copy";
import { useToast } from "../../../../components/toast";
import { BusyLabel } from "../../../../components/spinner";
import { ModuleGate } from "../../../../components/module-gate";

function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return `${n}st`;
  if (n % 10 === 2 && n !== 12) return `${n}nd`;
  if (n % 10 === 3 && n !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function PayrollSettingsPageGated() {
  return (
    <ModuleGate module="payroll" label="Payroll">
      <PayrollSettingsPage />
    </ModuleGate>
  );
}

function PayrollSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<PayrollSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCycle, setEditingCycle] = useState(false);
  const [anchorDay, setAnchorDay] = useState("1");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchPayrollSettings()
      .then((s) => {
        setSettings(s);
        setAnchorDay(String(s.payCalendar.monthlyAnchorDay));
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function saveCycle(): Promise<void> {
    const day = Number(anchorDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return;
    }
    setSaving(true);
    try {
      await updatePayCalendar({ monthlyAnchorDay: day });
      toast.success("Pay cycle updated");
      setEditingCycle(false);
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll settings</h1>
          <p className="text-sm text-slate-500">Pay cycle and statutory status for this salon.</p>
        </div>
        <Link href="/payroll" className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to payroll
        </Link>
      </div>

      {loading || !settings ? (
        <div className="flex flex-col gap-4">
          <div className="skeleton h-28 rounded-lg" />
          <div className="skeleton h-40 rounded-lg" />
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pay cycle</p>
            {editingCycle ? (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Cycle starts on</span>
                  <input
                    value={anchorDay}
                    onChange={(e) => setAnchorDay(e.target.value)}
                    inputMode="numeric"
                    className="min-h-11 w-20 rounded border border-slate-300 px-3 text-sm tabular"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveCycle()}
                  className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  <BusyLabel busy={saving} busyText="Saving…">
                    Save
                  </BusyLabel>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCycle(false);
                    setAnchorDay(String(settings.payCalendar.monthlyAnchorDay));
                  }}
                  className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {settings.payCalendar.monthlyAnchorDay === 1 ? (
                    "Calendar month"
                  ) : (
                    <>
                      {ordinal(settings.payCalendar.monthlyAnchorDay)} to {ordinal(settings.payCalendar.monthlyAnchorDay - 1 || 31)}
                    </>
                  )}
                  <span className="ml-1 font-normal text-slate-500">
                    — {settings.payCalendar.monthlyAnchorDay === 1 ? "1st to the last day of each month" : "each cycle"}
                  </span>
                </p>
                <p className="mt-2 max-w-[60ch] text-xs text-slate-500">
                  Used for monthly-salaried staff&apos;s pay periods. Daily-wage staff are paid per day worked and
                  don&apos;t need a cycle.
                </p>
                <button
                  type="button"
                  onClick={() => setEditingCycle(true)}
                  className="mt-3 min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change cycle
                </button>
              </>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Statutory deductions</p>
                <p className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-900">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      settings.statutoryPayrollEnabled ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {settings.statutoryPayrollEnabled ? "On" : "Off"}
                  </span>
                  EPF, ETF, and APIT
                </p>
                <p className="mt-2 max-w-[58ch] text-xs text-slate-500">
                  These are set and turned on by ZelyraOne, not from here — EPF, ETF and APIT rates are facts about
                  Sri Lankan law, not a setting your salon configures. They stay off until a qualified payroll/accounting
                  professional has reviewed your setup, so payroll runs normally in the meantime without them.
                </p>
              </div>
              {!settings.statutoryPayrollEnabled ? (
                <a
                  href="mailto:hello@zelyraone.lk?subject=Enable%20statutory%20payroll"
                  className="min-h-9 shrink-0 rounded border border-teal-600 px-3 text-xs font-medium text-teal-700 hover:bg-teal-50"
                >
                  Contact ZelyraOne to enable
                </a>
              ) : null}
            </div>

            {settings.statutoryPayrollEnabled && settings.statutoryRuleSet ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                {!settings.statutoryRuleSet.verified ? (
                  <p className="mb-2 text-xs font-medium text-amber-700">
                    These rates are configured but not yet professionally reviewed.
                  </p>
                ) : null}
                <div className="flex flex-col divide-y divide-slate-50 text-sm">
                  <RateLine label="EPF — employee contribution" value={`${settings.statutoryRuleSet.epfEmployeePercent}%`} />
                  <RateLine label="EPF — employer contribution" value={`${settings.statutoryRuleSet.epfEmployerPercent}%`} />
                  <RateLine label="ETF — employer contribution" value={`${settings.statutoryRuleSet.etfEmployerPercent}%`} />
                  <RateLine
                    label="APIT — tax-free monthly threshold"
                    value={`Rs. ${(settings.statutoryRuleSet.apitMonthlyFreeThresholdCents / 100).toLocaleString("en-LK")}`}
                  />
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function RateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="tabular font-medium text-slate-900">{value}</span>
    </div>
  );
}
