"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPayrollCostSummary, type PayrollCostSummaryView } from "../../../../lib/api-client";
import { formatDateRange, formatPriceCents, todayLocalDate } from "../../../../lib/format";
import { Cell, DataTable, Row } from "../../../../components/data-table";
import { EmptyState } from "../../../../components/empty-state";
import { ModuleGate } from "../../../../components/module-gate";

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Awaiting review",
  APPROVED: "Approved",
  PAID: "Paid",
};

export default function PayrollReportsPageGated() {
  return (
    <ModuleGate module="payroll" label="Payroll">
      <PayrollReportsPage />
    </ModuleGate>
  );
}

/**
 * A cost breakdown grouped the way a bookkeeper needs it for manual entry
 * into whatever accounting software the salon already uses — this product
 * has no accounting/GL system to post a journal into (DECISIONS.md §70).
 */
function PayrollReportsPage() {
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(todayLocalDate());
  const [summary, setSummary] = useState<PayrollCostSummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (to < from) return;
    setLoading(true);
    setError(null);
    fetchPayrollCostSummary(from, to)
      .then(setSummary)
      .catch(() => setError("Could not load this report."))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(load, [load]);

  function exportCsv(): void {
    if (!summary) return;
    const header = ["Period start", "Period end", "Status", "Staff", "Gross", "Employer statutory cost", "Net"];
    const rows = summary.runs.map((r) => [
      r.periodStart,
      r.periodEnd,
      RUN_STATUS_LABEL[r.status] ?? r.status,
      String(r.staffCount),
      (r.grossCents / 100).toFixed(2),
      (r.employerStatutoryCostCents / 100).toFixed(2),
      (r.netCents / 100).toFixed(2),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-cost-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll reports</h1>
          <p className="text-sm text-slate-500">A cost breakdown to hand to your accountant or key into your own books.</p>
        </div>
        <Link href="/payroll" className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to payroll
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">To</span>
          <input
            type="date"
            value={to}
            max={todayLocalDate()}
            onChange={(e) => setTo(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm tabular"
          />
        </label>
        <button
          type="button"
          disabled={!summary || summary.runsCount === 0}
          onClick={exportCsv}
          className="min-h-11 rounded border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : loading ? (
        <div className="skeleton h-48 rounded-lg" />
      ) : !summary || summary.runsCount === 0 ? (
        <EmptyState title="No completed payroll runs in this range yet." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <CostCard label="Base pay expense" value={summary.totalBasePayCents} />
            <CostCard label="Commission expense" value={summary.totalIncentiveCents} />
            <CostCard label="Allowances expense" value={summary.totalAllowancesCents} />
            <CostCard label="Gross pay" value={summary.totalGrossCents} strong />
            <CostCard label="EPF withheld (employee)" value={summary.totalEpfEmployeeCents} muted />
            <CostCard label="EPF expense (employer)" value={summary.totalEpfEmployerCents} muted />
            <CostCard label="ETF expense (employer)" value={summary.totalEtfEmployerCents} muted />
            <CostCard label="APIT withheld" value={summary.totalApitCents} muted />
            <CostCard label="Deductions recovered" value={summary.totalDeductionsCents} muted />
            <CostCard label="Net pay (cash/bank)" value={summary.totalNetCents} strong />
            <CostCard label="Total cost to salon" value={summary.totalEmployerCostCents} strong accent />
          </div>
          <p className="text-xs text-slate-400">
            {summary.runsCount} completed run{summary.runsCount === 1 ? "" : "s"} · {summary.staffCount} staff member
            {summary.staffCount === 1 ? "" : "s"} paid in this range. Only runs fully contained in the selected dates
            are counted — a run only partly inside the range is left out rather than counted at a fraction.
          </p>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Runs in this range</p>
            <DataTable
              caption="Payroll runs contributing to this report"
              columns={[
                { label: "Period" },
                { label: "Status" },
                { label: "Staff", align: "right" },
                { label: "Gross", align: "right" },
                { label: "Employer cost", align: "right" },
                { label: "Net", align: "right" },
              ]}
            >
              {summary.runs.map((r) => (
                <Row key={r.id}>
                  <Cell className="tabular">{formatDateRange(r.periodStart, r.periodEnd)}</Cell>
                  <Cell>{RUN_STATUS_LABEL[r.status] ?? r.status}</Cell>
                  <Cell align="right">{r.staffCount}</Cell>
                  <Cell align="right">{formatPriceCents(r.grossCents)}</Cell>
                  <Cell align="right">{formatPriceCents(r.employerStatutoryCostCents)}</Cell>
                  <Cell align="right">{formatPriceCents(r.netCents)}</Cell>
                </Row>
              ))}
            </DataTable>
          </div>
        </>
      )}
    </div>
  );
}

function CostCard({ label, value, strong = false, muted = false, accent = false }: { label: string; value: number; strong?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3.5 ${accent ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-white"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`tabular mt-1 text-lg ${
          accent ? "font-bold text-teal-800" : strong ? "font-bold text-slate-900" : muted ? "font-medium text-slate-500" : "font-semibold text-slate-900"
        }`}
      >
        {formatPriceCents(value)}
      </p>
    </div>
  );
}

/** Quotes a CSV field only when it needs it — a comma, quote, or newline. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
