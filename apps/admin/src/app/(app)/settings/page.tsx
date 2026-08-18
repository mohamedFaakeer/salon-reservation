"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  fetchBranch,
  fetchTenantMe,
  fetchTenantSettings,
  updateBranch,
  updateTenantProfile,
  updateTenantSettings,
  type AdvanceRuleValue,
  type BranchRecord,
  type TenantMe,
  type TenantSettingsPatch,
  type TenantSettingsView,
} from "../../../lib/api-client";
import { canManageSettings } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { AdvanceRuleField } from "../../../components/advance-rule-field";
import { ReminderOffsetsField } from "../../../components/reminder-offsets-field";
import {
  NumberField,
  ReadOnlyFact,
  Section,
  TextField,
  isWholeNumberWithin,
} from "../../../components/settings-fields";
import { SettingsSkeleton } from "../../../components/loading-skeleton";
import { BusyLabel } from "../../../components/spinner";

/**
 * Settings — the rules the booking engine runs on.
 *
 * Everything here is read back by the server on every booking, cancellation
 * and refund, so nothing on this page computes a customer-facing amount. The
 * page's job is to make each stored number say what it will do, and to make
 * saving deliberate: the whole form is one draft, and only the fields that
 * actually changed are sent.
 *
 * Three resources sit behind one form — the tenant profile, its settings, and
 * the single branch. They are saved as separate requests because that is what
 * the API exposes, so a partial failure is reported as one, naming what did
 * and did not save rather than a blanket "couldn't save".
 */

interface FormState {
  salonName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  advanceRule: AdvanceRuleValue;
  advanceRupees: string;
  advancePercent: string;
  cutoffHours: string;
  refundBefore: string;
  refundAfter: string;
  noShowRefund: string;
  bookingWindowDays: string;
  sameDayLeadMinutes: string;
  noShowGraceMinutes: string;
  reminderOffsets: number[];
}

/**
 * An empty box, not the string "undefined".
 *
 * `tenant.settings` is a jsonb blob, and rows written before a field existed
 * simply lack the key — no migration backfills it — so missing and null both
 * mean "not set" here.
 */
function optionalNumberToInput(
  value: number | null | undefined,
  transform: (n: number) => number = (n) => n,
): string {
  return value === null || value === undefined ? "" : String(transform(value));
}

function toForm(
  tenant: TenantMe["tenant"],
  settings: TenantSettingsView,
  branch: BranchRecord,
): FormState {
  return {
    salonName: tenant.name,
    branchName: branch.name,
    branchAddress: branch.address ?? "",
    branchPhone: branch.phone ?? "",
    advanceRule: settings.advanceRule,
    // Cents in, rupees on screen — the same translation the service drawer makes.
    advanceRupees: optionalNumberToInput(settings.advanceValueCents, (c) => c / 100),
    advancePercent: optionalNumberToInput(settings.advancePercent),
    cutoffHours: String(settings.cancellationPolicy.selfServiceCutoffHours),
    refundBefore: String(settings.cancellationPolicy.refundPercentBeforeCutoff),
    refundAfter: String(settings.cancellationPolicy.refundPercentAfterCutoff),
    noShowRefund: String(settings.cancellationPolicy.noShowRefundPercent),
    bookingWindowDays: String(settings.bookingWindowDays),
    sameDayLeadMinutes: String(settings.sameDayLeadMinutes),
    noShowGraceMinutes: String(settings.noShowGraceMinutes),
    reminderOffsets: [...settings.reminderOffsets].sort((a, b) => b - a),
  };
}

/** Every bounded field, so validity and the error hints can't drift apart. */
const BOUNDS = {
  cutoffHours: [0, 2160],
  refundBefore: [0, 100],
  refundAfter: [0, 100],
  noShowRefund: [0, 100],
  bookingWindowDays: [1, 365],
  sameDayLeadMinutes: [0, 1440],
  noShowGraceMinutes: [0, 1440],
} as const;

function isValid(form: FormState): boolean {
  if (form.salonName.trim().length < 2 || form.branchName.trim().length < 1) {
    return false;
  }
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    if (!isWholeNumberWithin(form[key as keyof typeof BOUNDS], min, max)) {
      return false;
    }
  }
  if (form.advanceRule === "FIXED_AMOUNT" && !isWholeNumberWithin(form.advanceRupees, 0, 1_000_000)) {
    return false;
  }
  if (form.advanceRule === "PERCENTAGE" && !isWholeNumberWithin(form.advancePercent, 0, 100)) {
    return false;
  }
  return true;
}

/**
 * The deposit fields are sent as a set. The server prices FIXED_AMOUNT from
 * cents and PERCENTAGE from percent, so the field the new rule does not use is
 * explicitly cleared — leaving a stale number behind is how a salon ends up
 * charging a deposit it thought it had turned off.
 */
function advancePatch(form: FormState): Pick<
  TenantSettingsPatch,
  "advanceRule" | "advanceValueCents" | "advancePercent"
> {
  return {
    advanceRule: form.advanceRule,
    advanceValueCents:
      form.advanceRule === "FIXED_AMOUNT" ? Math.round(Number(form.advanceRupees) * 100) : null,
    advancePercent: form.advanceRule === "PERCENTAGE" ? Number(form.advancePercent) : null,
  };
}

export default function SettingsPage() {
  const { user } = useAuth();
  const canManage = canManageSettings(user?.roles ?? []);

  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [meta, setMeta] = useState<{ slug: string; currency: string; timezone: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTenantMe(), fetchTenantSettings(), fetchBranch()])
      .then(([me, settings, branch]) => {
        const next = toForm(me.tenant, settings, branch);
        setBaseline(next);
        setForm(next);
        setMeta({
          slug: me.tenant.slug,
          currency: settings.currency,
          timezone: settings.timezone,
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load settings.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const dirty = useMemo(
    () => Boolean(form && baseline) && JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  const valid = form ? isValid(form) : false;

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setNotice(null);
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(): Promise<void> {
    if (!form || !baseline || !valid) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);

    const steps: Array<{ label: string; run: () => Promise<unknown> }> = [];

    if (form.salonName.trim() !== baseline.salonName) {
      steps.push({
        label: "the salon name",
        run: () => updateTenantProfile({ name: form.salonName.trim() }),
      });
    }

    if (
      form.branchName.trim() !== baseline.branchName ||
      form.branchAddress.trim() !== baseline.branchAddress ||
      form.branchPhone.trim() !== baseline.branchPhone
    ) {
      steps.push({
        label: "the branch details",
        run: () =>
          updateBranch({
            name: form.branchName.trim(),
            address: form.branchAddress.trim(),
            phone: form.branchPhone.trim(),
          }),
      });
    }

    const patch: TenantSettingsPatch = {};
    if (
      form.advanceRule !== baseline.advanceRule ||
      form.advanceRupees !== baseline.advanceRupees ||
      form.advancePercent !== baseline.advancePercent
    ) {
      Object.assign(patch, advancePatch(form));
    }
    const policy: TenantSettingsPatch["cancellationPolicy"] = {};
    if (form.cutoffHours !== baseline.cutoffHours) {
      policy.selfServiceCutoffHours = Number(form.cutoffHours);
    }
    if (form.refundBefore !== baseline.refundBefore) {
      policy.refundPercentBeforeCutoff = Number(form.refundBefore);
    }
    if (form.refundAfter !== baseline.refundAfter) {
      policy.refundPercentAfterCutoff = Number(form.refundAfter);
    }
    if (form.noShowRefund !== baseline.noShowRefund) {
      policy.noShowRefundPercent = Number(form.noShowRefund);
    }
    if (Object.keys(policy).length > 0) {
      patch.cancellationPolicy = policy;
    }
    if (form.bookingWindowDays !== baseline.bookingWindowDays) {
      patch.bookingWindowDays = Number(form.bookingWindowDays);
    }
    if (form.sameDayLeadMinutes !== baseline.sameDayLeadMinutes) {
      patch.sameDayLeadMinutes = Number(form.sameDayLeadMinutes);
    }
    if (form.noShowGraceMinutes !== baseline.noShowGraceMinutes) {
      patch.noShowGraceMinutes = Number(form.noShowGraceMinutes);
    }
    if (
      JSON.stringify(form.reminderOffsets) !== JSON.stringify(baseline.reminderOffsets)
    ) {
      patch.reminderOffsets = form.reminderOffsets;
    }
    if (Object.keys(patch).length > 0) {
      steps.push({ label: "the booking rules", run: () => updateTenantSettings(patch) });
    }

    const done: string[] = [];
    try {
      for (const step of steps) {
        await step.run();
        done.push(step.label);
      }
      setNotice("Settings saved.");
    } catch (err) {
      const reason =
        err instanceof ApiRequestError ? err.message : "The server rejected the change.";
      const failed = steps[done.length]?.label ?? "your changes";
      setError(
        done.length > 0
          ? `Saved ${done.join(" and ")}, but could not save ${failed}: ${reason}`
          : `Could not save ${failed}: ${reason}`,
      );
    } finally {
      setSaving(false);
      // Reload either way: after a partial failure the screen must show what
      // the server actually holds, not the draft that half-succeeded.
      load();
    }
  }

  if (loading || !form || !baseline || !meta) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : (
          <SettingsSkeleton />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Header />

      {!canManage ? (
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          You can see these rules but not change them. Ask an owner or manager.
        </p>
      ) : null}

      <div role="status" aria-live="polite">
        {notice ? (
          <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {notice}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="settings-error"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <Section
        title="Salon details"
        description="What customers see on the booking page and on their confirmations."
      >
        <TextField
          id="salon-name"
          label="Salon name"
          value={form.salonName}
          onChange={(v) => set("salonName", v)}
          disabled={!canManage}
          invalid={form.salonName.trim().length < 2}
          hint="At least 2 characters."
        />
        <TextField
          id="branch-name"
          label="Branch name"
          value={form.branchName}
          onChange={(v) => set("branchName", v)}
          disabled={!canManage}
          invalid={form.branchName.trim().length < 1}
          hint="One branch per salon in this version."
        />
        <TextField
          id="branch-address"
          label="Address"
          value={form.branchAddress}
          onChange={(v) => set("branchAddress", v)}
          disabled={!canManage}
          optional
          placeholder="42 Galle Road, Colombo 03"
        />
        <TextField
          id="branch-phone"
          label="Phone"
          value={form.branchPhone}
          onChange={(v) => set("branchPhone", v)}
          disabled={!canManage}
          optional
          placeholder="+94 11 234 5678"
        />

        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 sm:grid-cols-3">
          <ReadOnlyFact label="Booking link" value={`/salons/${meta.slug}`} />
          <ReadOnlyFact label="Currency" value={meta.currency} />
          <ReadOnlyFact label="Timezone" value={meta.timezone} />
        </div>
        <p className="text-xs text-slate-500">
          The link, currency and timezone are fixed when the salon is set up — changing them would
          break links customers already have.
        </p>
      </Section>

      <Section
        title="Deposits"
        description="Whether a booking has to be paid for, in part or in full, before the slot is held."
      >
        <AdvanceRuleField
          rule={form.advanceRule}
          onRuleChange={(v) => set("advanceRule", v)}
          fixedRupees={form.advanceRupees}
          onFixedRupeesChange={(v) => set("advanceRupees", v)}
          percent={form.advancePercent}
          onPercentChange={(v) => set("advancePercent", v)}
          disabled={!canManage}
        />
      </Section>

      <Section
        title="Cancellations and refunds"
        description="What a customer gets back, and when they can still cancel on their own."
      >
        {/* Laid out as the sentence the refund calculator actually evaluates,
            in its order, so the four numbers read as one rule instead of four
            unrelated percentages. */}
        <div className="flex flex-col gap-4">
          <NumberField
            id="cutoff-hours"
            label="Customers can cancel themselves up to"
            value={form.cutoffHours}
            onChange={(v) => set("cutoffHours", v)}
            min={BOUNDS.cutoffHours[0]}
            max={BOUNDS.cutoffHours[1]}
            unit="hours before the appointment"
            hint="0 lets them cancel right up to the start. After the cut-off they have to call."
            disabled={!canManage}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <RefundCase
              id="refund-before"
              caseLabel="Cancelled in time"
              value={form.refundBefore}
              onChange={(v) => set("refundBefore", v)}
              disabled={!canManage}
            />
            <RefundCase
              id="refund-after"
              caseLabel="Cancelled late"
              value={form.refundAfter}
              onChange={(v) => set("refundAfter", v)}
              disabled={!canManage}
            />
            <RefundCase
              id="refund-no-show"
              caseLabel="Never turned up"
              value={form.noShowRefund}
              onChange={(v) => set("noShowRefund", v)}
              disabled={!canManage}
            />
          </div>

          <p className="text-xs text-slate-500">
            Percentages are of what the customer has already paid. Staff can always cancel and
            refund outside these rules — this governs what customers can do themselves.
          </p>
        </div>
      </Section>

      <Section
        title="Booking window"
        description="How far ahead customers can book, and how close to the appointment."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="booking-window-days"
            label="Book up to"
            value={form.bookingWindowDays}
            onChange={(v) => set("bookingWindowDays", v)}
            min={BOUNDS.bookingWindowDays[0]}
            max={BOUNDS.bookingWindowDays[1]}
            unit="days ahead"
            hint="Nothing further out is offered."
            disabled={!canManage}
          />
          <NumberField
            id="same-day-lead"
            label="Same-day notice"
            value={form.sameDayLeadMinutes}
            onChange={(v) => set("sameDayLeadMinutes", v)}
            min={BOUNDS.sameDayLeadMinutes[0]}
            max={BOUNDS.sameDayLeadMinutes[1]}
            unit="minutes"
            hint="Slots sooner than this are hidden online."
            disabled={!canManage}
          />
          <NumberField
            id="no-show-grace"
            label="No-show grace"
            value={form.noShowGraceMinutes}
            onChange={(v) => set("noShowGraceMinutes", v)}
            min={BOUNDS.noShowGraceMinutes[0]}
            max={BOUNDS.noShowGraceMinutes[1]}
            unit="minutes"
            hint="How late before staff can mark a no-show."
            disabled={!canManage}
          />
        </div>
        <p className="text-xs text-slate-500">
          Same-day notice only limits the online booking page. Reception can still book a walk-in
          for right now.
        </p>
      </Section>

      <Section
        title="Reminders"
        description="Automatic messages before the appointment. Up to five."
      >
        <ReminderOffsetsField
          offsets={form.reminderOffsets}
          onChange={(v) => set("reminderOffsets", v)}
          disabled={!canManage}
        />
      </Section>

      {canManage ? (
        <div
          data-testid="settings-savebar"
          className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_12px_rgba(15,23,42,0.06)]"
        >
          <p className="text-sm text-slate-600" data-testid="settings-dirty-state">
            {!dirty
              ? "No changes to save."
              : valid
                ? "You have unsaved changes."
                : "Fix the highlighted fields before saving."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="settings-discard"
              onClick={() => {
                setForm(baseline);
                setError(null);
                setNotice(null);
              }}
              disabled={!dirty || saving}
              className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Discard
            </button>
            <button
              type="button"
              data-testid="settings-save"
              onClick={() => void save()}
              disabled={!dirty || !valid || saving}
              className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <BusyLabel busy={saving} busyText="Saving…">
                Save changes
              </BusyLabel>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        The rules every booking, cancellation and refund is measured against.
      </p>
    </div>
  );
}

/** One branch of the refund rule: the situation, then what it pays back. */
function RefundCase({
  id,
  caseLabel,
  value,
  onChange,
  disabled,
}: {
  id: string;
  caseLabel: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
        {caseLabel}
      </p>
      <div className="mt-1.5">
        <NumberField
          id={id}
          label="Refund"
          value={value}
          onChange={onChange}
          min={0}
          max={100}
          unit="% back"
          hint=""
          disabled={disabled}
        />
      </div>
    </div>
  );
}
