"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  approvePayrollRun,
  fetchPayrollRuns,
  markPayrollRunPaid,
  runPayroll,
  voidPayrollRun,
  type PayrollPaymentMethod,
  type PayrollRunLine,
  type PayrollRunView,
} from "../../../../lib/api-client";
import { errorCopy } from "../../../../lib/error-copy";
import { formatDateRange, formatPriceCents, todayLocalDate } from "../../../../lib/format";
import { useToast } from "../../../../components/toast";
import { BusyLabel } from "../../../../components/spinner";
import { EmptyState } from "../../../../components/empty-state";
import { Cell, DataTable, Row, RowActions } from "../../../../components/data-table";
import { ModuleGate } from "../../../../components/module-gate";

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const STATUS_STYLE: Record<PayrollRunView["status"], { fill: string; fg: string; label: string }> = {
  SUBMITTED: { fill: "#FEF3C7", fg: "#92400E", label: "Awaiting review" },
  APPROVED: { fill: "#CCFBF1", fg: "#0F766E", label: "Approved" },
  PAID: { fill: "#D1FAE5", fg: "#065F46", label: "Paid" },
  VOID: { fill: "#E2E8F0", fg: "#475569", label: "Void" },
};

const PAYMENT_METHOD_LABEL: Record<PayrollPaymentMethod, string> = {
  CASH: "cash",
  BANK_TRANSFER: "bank transfer",
  MIXED: "mixed methods",
};

export default function PayrollRunsPageGated() {
  return (
    <ModuleGate module="payroll" label="Payroll">
      <PayrollRunsPage />
    </ModuleGate>
  );
}

function PayrollRunsPage() {
  const toast = useToast();
  const [runs, setRuns] = useState<PayrollRunView[]>([]);
  const [loading, setLoading] = useState(true);

  const [periodStart, setPeriodStart] = useState(firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(todayLocalDate());
  const [running, setRunning] = useState(false);

  const [activeRun, setActiveRun] = useState<PayrollRunView | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PayrollPaymentMethod>("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetchPayrollRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function openNew(): void {
    setActiveRun(null);
    setPeriodStart(firstOfMonth());
    setPeriodEnd(todayLocalDate());
    setVoiding(false);
    setVoidReason("");
    setMarkingPaid(false);
    setPaymentReference("");
    setPanelOpen(true);
  }

  function openExisting(run: PayrollRunView): void {
    setActiveRun(run);
    setVoiding(false);
    setVoidReason("");
    setMarkingPaid(false);
    setPaymentReference("");
    setPanelOpen(true);
  }

  function closePanel(): void {
    setPanelOpen(false);
    setActiveRun(null);
  }

  /**
   * Submitting is idempotent on the money (DECISIONS.md #66): calling this
   * for a period whose figures haven't moved just returns the same live
   * run, which is what makes this the way to "preview" one, too — there's
   * no separate non-persisting whole-run preview endpoint.
   */
  async function submit(): Promise<void> {
    if (periodEnd < periodStart) {
      return;
    }
    setRunning(true);
    try {
      const run = await runPayroll({ periodStart, periodEnd });
      setActiveRun(run);
      toast.success(
        run.status === "SUBMITTED" ? "Payroll submitted for review" : "Payroll run",
        `${run.staffCount} staff · ${formatPriceCents(run.totalNetCents)} net`,
      );
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setRunning(false);
    }
  }

  async function approve(): Promise<void> {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await approvePayrollRun(activeRun.id);
      setActiveRun(updated);
      toast.success("Payroll approved");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMarkPaid(): Promise<void> {
    if (!activeRun) return;
    setBusy(true);
    try {
      const updated = await markPayrollRunPaid(activeRun.id, {
        paymentMethod,
        reference: paymentReference.trim() || undefined,
      });
      setActiveRun(updated);
      setMarkingPaid(false);
      setPaymentReference("");
      toast.success("Marked paid");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  async function confirmVoid(): Promise<void> {
    if (!activeRun || voidReason.trim().length < 3) return;
    setBusy(true);
    try {
      const updated = await voidPayrollRun(activeRun.id, voidReason.trim());
      setActiveRun(updated);
      setVoiding(false);
      setVoidReason("");
      toast.success("Payroll run voided");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll runs</h1>
          <p className="text-sm text-slate-500">Every staff member with pay set up, combined into one figure per period.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payroll" className="text-sm font-medium text-teal-700 hover:underline">
            ← Back to payroll
          </Link>
          <button
            type="button"
            onClick={openNew}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Run payroll
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-40 rounded-lg" />
      ) : runs.length === 0 ? (
        <EmptyState title="No payroll has been run yet." action={{ label: "Run payroll", onClick: openNew }} />
      ) : (
        <DataTable
          caption="Payroll runs for this salon"
          columns={[
            { label: "Period" },
            { label: "Status" },
            { label: "Staff", align: "right" },
            { label: "Gross", align: "right" },
            { label: "Net", align: "right" },
            { label: "Submitted by" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {runs.map((run) => (
            <Row key={run.id} muted={run.status === "VOID"}>
              <Cell className="tabular">{formatDateRange(run.periodStart, run.periodEnd)}</Cell>
              <Cell>
                <span
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: STATUS_STYLE[run.status].fill, color: STATUS_STYLE[run.status].fg }}
                >
                  {STATUS_STYLE[run.status].label}
                </span>
              </Cell>
              <Cell align="right">{run.staffCount}</Cell>
              <Cell align="right">{formatPriceCents(run.totalGrossCents)}</Cell>
              <Cell align="right">{formatPriceCents(run.totalNetCents)}</Cell>
              <Cell>{run.submittedByName}</Cell>
              <RowActions>
                <button
                  type="button"
                  onClick={() => openExisting(run)}
                  className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  {run.status === "SUBMITTED" ? "Review" : "View"}
                </button>
              </RowActions>
            </Row>
          ))}
        </DataTable>
      )}

      {panelOpen ? (
        <RunPanel
          run={activeRun}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onPeriodStartChange={setPeriodStart}
          onPeriodEndChange={setPeriodEnd}
          running={running}
          onSubmit={() => void submit()}
          busy={busy}
          onApprove={() => void approve()}
          markingPaid={markingPaid}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          paymentReference={paymentReference}
          onPaymentReferenceChange={setPaymentReference}
          onStartMarkPaid={() => setMarkingPaid(true)}
          onCancelMarkPaid={() => {
            setMarkingPaid(false);
            setPaymentReference("");
          }}
          onConfirmMarkPaid={() => void confirmMarkPaid()}
          voiding={voiding}
          voidReason={voidReason}
          onVoidReasonChange={setVoidReason}
          onStartVoid={() => setVoiding(true)}
          onCancelVoid={() => {
            setVoiding(false);
            setVoidReason("");
          }}
          onConfirmVoid={() => void confirmVoid()}
          onClose={closePanel}
        />
      ) : null}
    </div>
  );
}

function RunPanel({
  run,
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  running,
  onSubmit,
  busy,
  onApprove,
  markingPaid,
  paymentMethod,
  onPaymentMethodChange,
  paymentReference,
  onPaymentReferenceChange,
  onStartMarkPaid,
  onCancelMarkPaid,
  onConfirmMarkPaid,
  voiding,
  voidReason,
  onVoidReasonChange,
  onStartVoid,
  onCancelVoid,
  onConfirmVoid,
  onClose,
}: {
  run: PayrollRunView | null;
  periodStart: string;
  periodEnd: string;
  onPeriodStartChange: (v: string) => void;
  onPeriodEndChange: (v: string) => void;
  running: boolean;
  onSubmit: () => void;
  busy: boolean;
  onApprove: () => void;
  markingPaid: boolean;
  paymentMethod: PayrollPaymentMethod;
  onPaymentMethodChange: (v: PayrollPaymentMethod) => void;
  paymentReference: string;
  onPaymentReferenceChange: (v: string) => void;
  onStartMarkPaid: () => void;
  onCancelMarkPaid: () => void;
  onConfirmMarkPaid: () => void;
  voiding: boolean;
  voidReason: string;
  onVoidReasonChange: (v: string) => void;
  onStartVoid: () => void;
  onCancelVoid: () => void;
  onConfirmVoid: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {run ? `Payroll — ${formatDateRange(run.periodStart, run.periodEnd)}` : "Run payroll"}
            </h2>
            <p className="text-sm text-slate-500">
              {run
                ? run.status === "SUBMITTED"
                  ? "Awaiting review before this can be paid out."
                  : run.status === "APPROVED"
                    ? "Approved — ready to mark paid once the money has actually gone out."
                    : run.status === "PAID"
                      ? `Paid out in full${run.paymentMethod ? ` via ${PAYMENT_METHOD_LABEL[run.paymentMethod]}` : ""}${run.paymentReference ? ` (${run.paymentReference})` : ""}.`
                      : `Voided${run.voidReason ? ` — ${run.voidReason}` : ""}.`
                : "Choose a period. Covers every staff member with pay set up. Running it again for an unchanged period is safe."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {run ? (
            <StatusTrail run={run} />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Period start</span>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => onPeriodStartChange(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Period end</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => onPeriodEndChange(e.target.value)}
                  className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
                />
              </label>
              <button
                type="button"
                disabled={running || periodEnd < periodStart}
                onClick={onSubmit}
                className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <BusyLabel busy={running} busyText="Running…">
                  Run payroll
                </BusyLabel>
              </button>
            </div>
          )}

          {run ? (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
                <Stat label="Staff" value={String(run.staffCount)} />
                <Stat label="Gross" value={formatPriceCents(run.totalGrossCents)} />
                <Stat label="Statutory" value={run.lines.some((l) => l.statutory) ? "Applied" : "—"} />
                <Stat label="Net" value={formatPriceCents(run.totalNetCents)} />
              </div>

              <DataTable
                caption="Per-staff breakdown for this run"
                columns={[
                  { label: "Staff" },
                  { label: "Base pay", align: "right" },
                  { label: "Commission", align: "right" },
                  { label: "Allowances", align: "right" },
                  { label: "Deductions", align: "right" },
                  { label: "Statutory", align: "right" },
                  { label: "Net", align: "right" },
                  { label: "Payslip", srOnly: true },
                ]}
              >
                {run.lines.map((line) => (
                  <LineRow key={line.staffId} line={line} runId={run.id} payslipReady={run.status === "APPROVED" || run.status === "PAID"} />
                ))}
              </DataTable>

              {markingPaid ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <select
                    value={paymentMethod}
                    onChange={(e) => onPaymentMethodChange(e.target.value as PayrollPaymentMethod)}
                    className="min-h-10 rounded border border-slate-300 px-2 text-sm"
                  >
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="MIXED">Mixed methods</option>
                  </select>
                  <input
                    value={paymentReference}
                    onChange={(e) => onPaymentReferenceChange(e.target.value)}
                    placeholder="Reference or note (optional)"
                    className="min-h-10 flex-1 rounded border border-slate-300 px-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onConfirmMarkPaid}
                    className="min-h-10 rounded bg-teal-600 px-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    <BusyLabel busy={busy} busyText="…">
                      Confirm paid
                    </BusyLabel>
                  </button>
                  <button
                    type="button"
                    onClick={onCancelMarkPaid}
                    className="min-h-10 rounded border border-slate-300 px-3 text-sm font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {voiding ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <input
                    value={voidReason}
                    onChange={(e) => onVoidReasonChange(e.target.value)}
                    placeholder="Why void this run?"
                    className="min-h-10 flex-1 rounded border border-slate-300 px-3 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || voidReason.trim().length < 3}
                    onClick={onConfirmVoid}
                    className="min-h-10 rounded bg-slate-700 px-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    Confirm void
                  </button>
                  <button
                    type="button"
                    onClick={onCancelVoid}
                    className="min-h-10 rounded border border-slate-300 px-3 text-sm font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {run && !voiding && !markingPaid ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
            {run.status !== "PAID" && run.status !== "VOID" ? (
              <button type="button" onClick={onStartVoid} className="text-sm font-medium text-red-600 hover:underline">
                Void this run
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              {run.status === "SUBMITTED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onApprove}
                  className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  <BusyLabel busy={busy} busyText="Approving…">
                    Approve
                  </BusyLabel>
                </button>
              ) : null}
              {run.status === "APPROVED" ? (
                <button
                  type="button"
                  onClick={onStartMarkPaid}
                  className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Mark paid
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="tabular text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function LineRow({ line, runId, payslipReady }: { line: PayrollRunLine; runId: string; payslipReady: boolean }) {
  return (
    <Row>
      <Cell>
        <span className="font-medium text-slate-900">{line.staffName}</span>
        <span className="block text-xs text-slate-400">
          {line.payFrequency === "MONTHLY" ? "Monthly" : "Daily"}
          {line.unpaidAbsenceDays > 0 ? ` · ${line.unpaidAbsenceDays} unpaid day${line.unpaidAbsenceDays === 1 ? "" : "s"}` : ""}
          {line.unresolvedClosureDays > 0 ? ` · ${line.unresolvedClosureDays} closure day(s) not yet resolved` : ""}
        </span>
      </Cell>
      <Cell align="right">{formatPriceCents(line.basePayCents)}</Cell>
      <Cell align="right">
        {line.incentiveCents > 0 ? (
          <>
            {formatPriceCents(line.incentiveCents)}
            {line.incentiveSource === "LIVE_ESTIMATE" ? <span className="ml-1 text-xs text-slate-400">est.</span> : null}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </Cell>
      <Cell align="right">
        {line.allowancesCents > 0 ? formatPriceCents(line.allowancesCents) : <span className="text-slate-300">—</span>}
      </Cell>
      <Cell align="right">
        {line.deductionsCents > 0 ? `−${formatPriceCents(line.deductionsCents)}` : <span className="text-slate-300">—</span>}
      </Cell>
      <Cell align="right">
        {line.statutory ? (
          <span title={line.statutory.verified ? "Reviewed rates" : "Unverified rates"}>
            −{formatPriceCents(line.statutory.epfEmployeeCents + line.statutory.apitCents)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </Cell>
      <Cell align="right" className="font-semibold text-slate-900">
        {formatPriceCents(line.netCents)}
      </Cell>
      <Cell align="right">
        {payslipReady ? (
          <Link
            href={`/payroll/runs/${runId}/payslip/${line.staffId}`}
            target="_blank"
            className="text-xs font-medium text-teal-700 hover:underline"
          >
            Payslip
          </Link>
        ) : null}
      </Cell>
    </Row>
  );
}

function StatusTrail({ run }: { run: PayrollRunView }) {
  const steps: Array<{ label: string; sub: string; done: boolean }> = [
    { label: "Submitted", sub: `by ${run.submittedByName}`, done: true },
    {
      label: "Approved",
      sub: run.approvedByName ? `by ${run.approvedByName}` : "Awaiting approval",
      done: Boolean(run.approvedByName),
    },
  ];
  if (run.status === "PAID") {
    steps.push({ label: "Paid", sub: run.paidByName ? `by ${run.paidByName}` : "", done: true });
  }
  if (run.status === "VOID") {
    steps.push({ label: "Voided", sub: run.voidedByName ? `by ${run.voidedByName}` : "", done: true });
  }

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${step.done ? "bg-teal-600" : "bg-slate-300"}`} />
          <span className={`font-semibold ${step.done ? "text-slate-900" : "text-slate-400"}`}>{step.label}</span>
          <span className="text-slate-400">{step.sub}</span>
        </div>
      ))}
    </div>
  );
}
