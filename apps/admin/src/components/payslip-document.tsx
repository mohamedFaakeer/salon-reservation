"use client";

import { PAY_COMPONENT_LABEL, type PayrollRunLine, type PayrollRunView } from "../lib/api-client";
import { formatDateRange, formatPriceCents } from "../lib/format";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MIXED: "Mixed methods",
};

/**
 * A payslip, as a document — the same deliberate choice as
 * `RetailSaleReceipt`/`InvoiceDocument`: white paper, generous margins,
 * `print:` utilities strip the chrome so Ctrl-P produces a clean PDF
 * rather than reaching for a headless PDF renderer or a new dependency.
 *
 * Deliberately narrower than the full spec (§16): English only, no
 * year-to-date totals (those need aggregating across every run this staff
 * member has ever been part of, not built yet). Employer EPF/ETF are shown
 * as clearly-labelled informational lines, never folded into the
 * employee's own deductions.
 */
export function PayslipDocument({
  salonName,
  run,
  line,
}: {
  salonName: string;
  run: PayrollRunView;
  line: PayrollRunLine;
}) {
  return (
    <article className="mx-auto max-w-2xl bg-white p-8 text-slate-900 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{salonName}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Payslip</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Pay period</p>
          <p className="tabular text-sm font-semibold text-teal-700">{formatDateRange(run.periodStart, run.periodEnd)}</p>
          <p className="tabular text-xs text-slate-500">
            {run.status === "PAID" && run.paidAt ? `Paid ${new Date(run.paidAt).toLocaleDateString("en-LK")}` : "Approved, not yet paid"}
          </p>
        </div>
      </header>

      <section className="flex flex-wrap justify-between gap-6 py-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Employee</p>
          <p className="mt-0.5 font-medium">{line.staffName}</p>
          <p className="text-sm text-slate-500">{line.payFrequency === "MONTHLY" ? "Monthly salary" : "Daily wage"}</p>
        </div>
        {run.status === "PAID" ? (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Paid via</p>
            <p className="mt-0.5 text-sm">
              {run.paymentMethod ? PAYMENT_METHOD_LABEL[run.paymentMethod] : "—"}
              {run.paymentReference ? ` — ${run.paymentReference}` : ""}
            </p>
          </div>
        ) : null}
      </section>

      <dl className="flex flex-col divide-y divide-slate-100">
        <PayLine label="Base pay" value={formatPriceCents(line.basePayCents)} />
        {line.incentiveCents > 0 ? (
          <PayLine
            label={line.incentiveSource === "LIVE_ESTIMATE" ? "Commission (estimate)" : "Commission"}
            value={formatPriceCents(line.incentiveCents)}
          />
        ) : null}
        {line.payComponents
          .filter((c) => c.kind === "ALLOWANCE")
          .map((c) => (
            <PayLine key={c.type} label={PAY_COMPONENT_LABEL[c.type]} value={formatPriceCents(c.amountCents)} />
          ))}
        <PayLine label="Gross pay" value={formatPriceCents(line.grossCents)} strong />
        {line.statutory ? (
          <>
            <PayLine label="EPF (employee)" value={`− ${formatPriceCents(line.statutory.epfEmployeeCents)}`} muted />
            {line.statutory.apitCents > 0 ? (
              <PayLine label="APIT" value={`− ${formatPriceCents(line.statutory.apitCents)}`} muted />
            ) : null}
          </>
        ) : null}
        {line.payComponents
          .filter((c) => c.kind === "DEDUCTION")
          .map((c) => (
            <PayLine key={c.type} label={PAY_COMPONENT_LABEL[c.type]} value={`− ${formatPriceCents(c.amountCents)}`} muted />
          ))}
        <PayLine label="Net pay" value={formatPriceCents(line.netCents)} strong large />
      </dl>

      {line.statutory ? (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
            Paid by your salon — not deducted from your pay
          </p>
          <div className="flex flex-col gap-1 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>EPF (employer)</span>
              <span className="tabular">{formatPriceCents(line.statutory.epfEmployerCents)}</span>
            </div>
            <div className="flex justify-between">
              <span>ETF (employer)</span>
              <span className="tabular">{formatPriceCents(line.statutory.etfEmployerCents)}</span>
            </div>
          </div>
          {!line.statutory.verified ? (
            <p className="mt-2 text-xs text-amber-700">
              These statutory figures are configured but not yet professionally reviewed.
            </p>
          ) : null}
        </div>
      ) : null}

      {(line.unpaidAbsenceDays > 0 || line.unresolvedClosureDays > 0) && (
        <p className="mt-4 text-xs text-slate-500">
          {line.unpaidAbsenceDays > 0
            ? `${line.unpaidAbsenceDays} unpaid absence day${line.unpaidAbsenceDays === 1 ? "" : "s"} this period. `
            : ""}
          {line.unresolvedClosureDays > 0
            ? `${line.unresolvedClosureDays} closure day(s) not yet resolved for pay purposes.`
            : ""}
        </p>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Generated from {salonName}&apos;s payroll records. Contact your salon for any questions about this payslip.
      </footer>
    </article>
  );
}

function PayLine({
  label,
  value,
  strong = false,
  muted = false,
  large = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className={`text-sm ${muted ? "text-slate-500" : "text-slate-900"}`}>{label}</dt>
      <dd
        className={`tabular ${large ? "text-lg" : "text-sm"} ${
          strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
