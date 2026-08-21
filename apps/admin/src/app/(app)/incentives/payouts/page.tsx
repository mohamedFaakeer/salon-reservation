"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchIncentivePayouts,
  fetchIncentivePlans,
  fetchIncentivePreview,
  fetchStaff,
  markIncentivePayoutPaid,
  runIncentivePayout,
  voidIncentivePayout,
  type IncentivePayoutView,
  type IncentivePlanView,
  type IncentivePreviewRow,
  type StaffMember,
} from "../../../../lib/api-client";
import { errorCopy } from "../../../../lib/error-copy";
import { formatPriceCents, todayLocalDate } from "../../../../lib/format";
import { useToast } from "../../../../components/toast";
import { BusyLabel } from "../../../../components/spinner";
import { EmptyState } from "../../../../components/empty-state";
import { Cell, DataTable, Row, RowActions } from "../../../../components/data-table";

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const STATUS_STYLE: Record<IncentivePayoutView["status"], { fill: string; fg: string; label: string }> = {
  PAID: { fill: "#D1FAE5", fg: "#065F46", label: "Paid" },
  FINALISED: { fill: "#FEF3C7", fg: "#92400E", label: "Finalised" },
  VOID: { fill: "#E2E8F0", fg: "#475569", label: "Void" },
};

export default function IncentivePayoutsPage() {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [plans, setPlans] = useState<IncentivePlanView[]>([]);
  const [staffId, setStaffId] = useState("");
  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(todayLocalDate());

  const [preview, setPreview] = useState<IncentivePreviewRow | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const [history, setHistory] = useState<IncentivePayoutView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  useEffect(() => {
    Promise.all([fetchStaff(), fetchIncentivePlans()]).then(([s, p]) => {
      const withPlan = s.filter((m) => m.incentivePlanId);
      setStaff(withPlan);
      setPlans(p);
      if (withPlan.length > 0) {
        setStaffId(withPlan[0].id);
      }
    });
  }, []);

  const loadHistory = useCallback(() => {
    if (!staffId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    fetchIncentivePayouts({ staffId })
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [staffId]);

  useEffect(loadHistory, [loadHistory]);

  useEffect(() => {
    if (!staffId || !periodStart || !periodEnd || periodEnd < periodStart) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    fetchIncentivePreview({ from: periodStart, to: periodEnd, staffId })
      .then((rows) => setPreview(rows[0] ?? null))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [staffId, periodStart, periodEnd]);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const plan = plans.find((p) => p.id === selectedStaff?.incentivePlanId);

  const commissionLabel = useMemo(() => {
    if (!plan || plan.baseCommissionPercent === null) return "Commission";
    const overrides = plan.serviceRates.length;
    return `Commission (${plan.baseCommissionPercent}%${
      overrides > 0 ? `, ${overrides} service${overrides > 1 ? "s" : ""} at their own rate` : ""
    })`;
  }, [plan]);

  async function finalise(): Promise<void> {
    if (!staffId || !preview) return;
    setRunning(true);
    try {
      await runIncentivePayout({ staffId, periodStart, periodEnd });
      toast.success("Payout finalised", `${formatPriceCents(preview.totalCents)} for ${selectedStaff?.name ?? "this stylist"}.`);
      loadHistory();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setRunning(false);
    }
  }

  async function markPaid(id: string): Promise<void> {
    setBusyId(id);
    try {
      await markIncentivePayoutPaid(id);
      toast.success("Marked paid");
      loadHistory();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmVoid(id: string): Promise<void> {
    if (voidReason.trim().length < 3) return;
    setBusyId(id);
    try {
      await voidIncentivePayout(id, voidReason.trim());
      toast.success("Payout voided");
      setVoidingId(null);
      setVoidReason("");
      loadHistory();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Run a payout</h1>
          <p className="text-sm text-slate-500">One person, one period — the figure explained before it&apos;s frozen.</p>
        </div>
        <Link href="/incentives" className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to plans
        </Link>
      </div>

      {staff.length === 0 ? (
        <EmptyState title="No stylist has an incentive plan assigned yet — assign one from Staff & skills first." />
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex w-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:w-64">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Staff member</span>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Period start</span>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Period end</span>
                <input
                  type="date"
                  value={periodEnd}
                  max={todayLocalDate()}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
                />
              </label>
              <button
                type="button"
                disabled={!preview || preview.totalCents === 0 || running}
                onClick={() => void finalise()}
                className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <BusyLabel busy={running} busyText="Finalising…">
                  Finalise payout
                </BusyLabel>
              </button>
            </div>

            <div className="flex-1 rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Live figure</p>
              {previewLoading ? (
                <div className="skeleton mt-2 h-8 w-40 rounded" />
              ) : preview ? (
                <>
                  <p className="tabular mt-1 text-2xl font-bold text-slate-900">{formatPriceCents(preview.totalCents)}</p>
                  <div className="mt-3 flex flex-col divide-y divide-slate-50 text-sm">
                    <BreakdownLine label="Collected this period" value={formatPriceCents(preview.revenueCents)} />
                    {preview.commissionCents > 0 ? (
                      <BreakdownLine label={commissionLabel} value={formatPriceCents(preview.commissionCents)} />
                    ) : null}
                    {preview.perJobCents > 0 ? (
                      <BreakdownLine label="Flat per job" value={formatPriceCents(preview.perJobCents)} />
                    ) : null}
                    <BreakdownLine label="Jobs completed" value={String(preview.jobsCompleted)} />
                    {preview.tierBonusCents > 0 ? (
                      <BreakdownLine
                        label={
                          plan?.tierBonusPercent !== null && plan?.tierBonusPercent !== undefined && plan?.monthlyTargetCents
                            ? `Tier bonus (${plan.tierBonusPercent}% past ${formatPriceCents(plan.monthlyTargetCents)})`
                            : "Tier bonus"
                        }
                        value={formatPriceCents(preview.tierBonusCents)}
                      />
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {periodEnd < periodStart ? "The period end must be on or after its start." : "Nothing collected in this range yet."}
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payout history</p>
            {historyLoading ? (
              <div className="skeleton h-32 rounded-lg" />
            ) : history.length === 0 ? (
              <EmptyState title="No payouts run for this stylist yet." />
            ) : (
              <DataTable
                caption="Past payouts for the selected stylist"
                columns={[{ label: "Period" }, { label: "Total", align: "right" }, { label: "Status" }, { label: "Actions", srOnly: true }]}
              >
                {history.map((p) => (
                  <Row key={p.id}>
                    <Cell className="tabular">
                      {p.periodStart} – {p.periodEnd}
                    </Cell>
                    <Cell align="right">{formatPriceCents(p.totalCents)}</Cell>
                    <Cell>
                      <span
                        className="rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: STATUS_STYLE[p.status].fill, color: STATUS_STYLE[p.status].fg }}
                      >
                        {STATUS_STYLE[p.status].label}
                      </span>
                      {p.status === "VOID" && p.voidReason ? (
                        <span className="ml-2 text-xs text-slate-400">{p.voidReason}</span>
                      ) : null}
                    </Cell>
                    <RowActions>
                      {p.status === "FINALISED" ? (
                        voidingId === p.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                              placeholder="Why void this?"
                              className="min-h-9 rounded border border-slate-300 px-2 text-xs"
                            />
                            <button
                              type="button"
                              disabled={busyId === p.id || voidReason.trim().length < 3}
                              onClick={() => void confirmVoid(p.id)}
                              className="min-h-9 rounded bg-slate-700 px-2.5 text-xs font-medium text-white disabled:opacity-60"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setVoidingId(null);
                                setVoidReason("");
                              }}
                              className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => void markPaid(p.id)}
                              className="min-h-9 rounded bg-teal-600 px-2.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                            >
                              <BusyLabel busy={busyId === p.id} busyText="…">
                                Mark paid
                              </BusyLabel>
                            </button>
                            <button
                              type="button"
                              onClick={() => setVoidingId(p.id)}
                              className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                            >
                              Void
                            </button>
                          </>
                        )
                      ) : null}
                    </RowActions>
                  </Row>
                ))}
              </DataTable>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="tabular font-medium text-slate-900">{value}</span>
    </div>
  );
}
