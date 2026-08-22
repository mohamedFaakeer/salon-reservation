"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchTenantEntitlements,
  updateTenantEntitlements,
  type LimitOverridesInput,
  type ModuleOverridesInput,
  type PlanTier,
  type PlatformTenant,
  type ReportPanelOverridesInput,
  type TenantEntitlementsView,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

/**
 * A tenant's Lite/Pro tier plus per-module, per-report-panel and numeric-limit
 * overrides.
 *
 * Every toggle and number field here edits the *effective* value as it was
 * when the drawer opened — switching the tier radio doesn't live-simulate the
 * other tier's own defaults (that logic is server-side, on purpose, per
 * CLAUDE.md; duplicating it here would be a second place that could drift).
 * Practically: pick a tier, save, then reopen to fine-tune exceptions against
 * its real resolved defaults — the same two-step most admin tools use for
 * "change plan" vs. "adjust one thing for this account".
 */

const MODULE_ROWS: Array<{ key: keyof ModuleOverridesInput; name: string; desc: string }> = [
  { key: "attendance", name: "Attendance", desc: "Staff check-in/out, corrections" },
  { key: "incentives", name: "Incentives", desc: "Commission plans and payouts" },
  { key: "reports", name: "Reports", desc: "The page itself — on lets you pick which panels below" },
  { key: "auditLog", name: "Audit log", desc: "Who changed what, and when" },
  { key: "invoices", name: "Invoices", desc: "Branded, numbered documents" },
];

const REPORT_PANEL_ROWS: Array<{ key: keyof ReportPanelOverridesInput; name: string }> = [
  { key: "takings", name: "Takings & collections" },
  { key: "staff", name: "Staff performance" },
  { key: "services", name: "Service popularity" },
  { key: "busyHours", name: "Busy-hours heatmap" },
  { key: "lapsedCustomers", name: "Lapsed customers" },
  { key: "customerSpend", name: "Customer spend" },
  { key: "funnelLosses", name: "Funnel & losses" },
];

const SEAT_LIMIT_ROWS: Array<{ key: keyof LimitOverridesInput; label: string }> = [
  { key: "maxManagers", label: "Managers" },
  { key: "maxReceptionists", label: "Receptionists" },
  { key: "maxStaff", label: "Stylists (staff profiles)" },
];

const USAGE_LIMIT_ROWS: Array<{ key: keyof LimitOverridesInput; label: string }> = [
  { key: "maxBookingsPerDay", label: "Bookings / day" },
  { key: "maxServices", label: "Active services" },
  { key: "maxIncentivePlans", label: "Active incentive plans" },
];

const CEILING_ROWS: Array<{ key: keyof LimitOverridesInput; label: string; unit: string }> = [
  { key: "maxBookingWindowDays", label: "Booking window", unit: "days ahead, max" },
  { key: "maxReminderOffsets", label: "Reminders", unit: "max scheduled" },
  { key: "maxDiscountCapPercent", label: "Desk discount cap", unit: "% unaided, max" },
];

export function TenantEntitlementsDrawer({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: PlatformTenant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<TenantEntitlementsView | null>(null);
  const [tier, setTier] = useState<PlanTier>("PRO");
  const [moduleOverrides, setModuleOverrides] = useState<ModuleOverridesInput>({});
  const [reportPanelOverrides, setReportPanelOverrides] = useState<ReportPanelOverridesInput>({});
  const [limitOverrides, setLimitOverrides] = useState<LimitOverridesInput>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTenantEntitlements(tenant.id)
      .then((view) => {
        setCurrent(view);
        setTier(view.tier);
        setModuleOverrides(view.moduleOverrides);
        setReportPanelOverrides(view.reportPanelOverrides);
        setLimitOverrides(view.limitOverrides);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load this salon's plan.");
      })
      .finally(() => setLoading(false));
  }, [tenant.id]);

  async function save(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await updateTenantEntitlements(tenant.id, { tier, moduleOverrides, reportPanelOverrides, limitOverrides });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save this salon's plan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Manage plan" onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-slate-500">{tenant.name}</p>

      {loading || !current ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <section>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Plan tier</p>
            <div className="flex gap-2">
              <TierButton label="Lite" desc="Core booking only" selected={tier === "LITE"} onClick={() => setTier("LITE")} />
              <TierButton label="Pro" desc="Everything included" selected={tier === "PRO"} onClick={() => setTier("PRO")} />
            </div>
          </section>

          <section>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">Modules</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {MODULE_ROWS.map((row) => {
                const overridden = moduleOverrides[row.key] !== undefined;
                const checked = moduleOverrides[row.key] ?? current.modules[row.key];
                return (
                  <div key={row.key}>
                    <ModuleRow
                      name={row.name}
                      desc={row.desc}
                      checked={checked}
                      overridden={overridden}
                      onToggle={() => setModuleOverrides({ ...moduleOverrides, [row.key]: !checked })}
                      onReset={
                        overridden
                          ? () => {
                              const next = { ...moduleOverrides };
                              delete next[row.key];
                              setModuleOverrides(next);
                            }
                          : undefined
                      }
                    />
                    {row.key === "reports" && checked ? (
                      <div className="border-t border-slate-100 bg-slate-50 py-1 pl-6 pr-3">
                        {REPORT_PANEL_ROWS.map((panel) => {
                          const panelOverridden = reportPanelOverrides[panel.key] !== undefined;
                          const panelChecked = reportPanelOverrides[panel.key] ?? current.reportPanels[panel.key];
                          return (
                            <div key={panel.key} className="flex items-center justify-between gap-2 py-1.5">
                              <span className="text-[12.5px] text-slate-600">{panel.name}</span>
                              <div className="flex items-center gap-2">
                                {panelOverridden ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...reportPanelOverrides };
                                      delete next[panel.key];
                                      setReportPanelOverrides(next);
                                    }}
                                    className="text-[10.5px] font-medium text-teal-700 hover:underline"
                                  >
                                    Reset
                                  </button>
                                ) : null}
                                <Toggle
                                  small
                                  checked={panelChecked}
                                  onClick={() =>
                                    setReportPanelOverrides({ ...reportPanelOverrides, [panel.key]: !panelChecked })
                                  }
                                  label={panel.name}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <LimitSection
            title="Team seat limits"
            hint="hard cap — refused past this"
            rows={SEAT_LIMIT_ROWS}
            current={current.limits}
            overrides={limitOverrides}
            onChange={setLimitOverrides}
          />

          <LimitSection
            title="Usage limits"
            hint="soft — a little grace, then refused"
            rows={USAGE_LIMIT_ROWS}
            current={current.limits}
            overrides={limitOverrides}
            onChange={setLimitOverrides}
          />

          <LimitSection
            title="Settings ceilings"
            hint="caps the salon's own settings page"
            rows={CEILING_ROWS}
            current={current.limits}
            overrides={limitOverrides}
            onChange={setLimitOverrides}
          />

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={submitting}
              className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <BusyLabel busy={submitting} busyText="Saving…">
                Save changes
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
      )}
    </DrawerShell>
  );
}

function TierButton({
  label,
  desc,
  selected,
  onClick,
}: {
  label: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex-1 rounded-lg border-[1.5px] px-3 py-2.5 text-left ${
        selected ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900">
        <span
          className={`h-3 w-3 rounded-full border-2 ${selected ? "border-teal-600" : "border-slate-300"}`}
          style={selected ? { boxShadow: "inset 0 0 0 2px white, inset 0 0 0 5px #0d9488" } : undefined}
        />
        {label}
      </span>
      <span className="mt-0.5 block text-[11px] text-slate-500">{desc}</span>
    </button>
  );
}

function ModuleRow({
  name,
  desc,
  checked,
  overridden,
  onToggle,
  onReset,
}: {
  name: string;
  desc: string;
  checked: boolean;
  overridden: boolean;
  onToggle: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-slate-900">{name}</span>
          {overridden ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-800">
              Custom
            </span>
          ) : null}
        </span>
        <p className="text-[11px] text-slate-500">{desc}</p>
        {onReset ? (
          <button type="button" onClick={onReset} className="mt-0.5 text-[10.5px] font-medium text-teal-700 hover:underline">
            Reset to plan default
          </button>
        ) : null}
      </div>
      <Toggle checked={checked} onClick={onToggle} label={name} />
    </div>
  );
}

function Toggle({
  checked,
  onClick,
  label,
  small = false,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  small?: boolean;
}) {
  const size = small ? "h-[15px] w-[26px]" : "h-[18px] w-8";
  const dot = small ? "h-3 w-3" : "h-3.5 w-3.5";
  const translate = small ? (checked ? "translate-x-[11px]" : "translate-x-0.5") : checked ? "translate-x-4" : "translate-x-0.5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Turn ${label.toLowerCase()} ${checked ? "off" : "on"}`}
      onClick={onClick}
      className={`relative ${size} shrink-0 rounded-full transition-colors ${checked ? "bg-teal-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 ${dot} rounded-full bg-white transition-transform ${translate}`} />
    </button>
  );
}

function LimitSection({
  title,
  hint,
  rows,
  current,
  overrides,
  onChange,
}: {
  title: string;
  hint: string;
  rows: Array<{ key: keyof LimitOverridesInput; label: string; unit?: string }>;
  current: Required<LimitOverridesInput>;
  overrides: LimitOverridesInput;
  onChange: (next: LimitOverridesInput) => void;
}) {
  return (
    <section>
      <p className="mb-2 flex items-baseline justify-between text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        <span>{title}</span>
        <span className="font-normal normal-case text-slate-400">{hint}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => {
          const effective = overrides[row.key] !== undefined ? overrides[row.key] : current[row.key];
          return (
            <label key={row.key} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
              <span className="block text-[10.5px] text-slate-500">{row.label}</span>
              <input
                value={effective ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange({ ...overrides, [row.key]: raw === "" ? null : Number(raw) });
                }}
                placeholder="Unlimited"
                inputMode="numeric"
                className="tabular w-full border-none p-0 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-teal-700"
              />
              {row.unit ? <span className="block text-[10px] text-slate-400">{row.unit}</span> : null}
            </label>
          );
        })}
      </div>
    </section>
  );
}
