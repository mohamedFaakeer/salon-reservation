export interface PayrollReportRunRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  staffCount: number;
  grossCents: number;
  employerStatutoryCostCents: number;
  netCents: number;
}

/**
 * A cost breakdown grouped the way a bookkeeper needs it for manual entry
 * into whatever accounting software or spreadsheet the salon actually uses
 * — not a journal posted anywhere, since this product has no accounting/GL
 * system to post into (DECISIONS.md §70).
 */
export interface PayrollCostSummaryView {
  from: string;
  to: string;
  runsCount: number;
  staffCount: number;
  totalBasePayCents: number;
  totalIncentiveCents: number;
  totalAllowancesCents: number;
  totalDeductionsCents: number;
  totalGrossCents: number;
  totalEpfEmployeeCents: number;
  totalEpfEmployerCents: number;
  totalEtfEmployerCents: number;
  totalApitCents: number;
  /** Gross + employer EPF + employer ETF — the true cost to the company, not just what staff took home. */
  totalEmployerCostCents: number;
  totalNetCents: number;
  runs: PayrollReportRunRow[];
}
