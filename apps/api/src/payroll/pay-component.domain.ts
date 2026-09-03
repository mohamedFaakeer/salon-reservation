import { PayComponentKind, type PayComponentType } from "@salon/shared";

export interface PayComponentLine {
  type: PayComponentType;
  kind: PayComponentKind;
  amountCents: number;
  epfApplicable: boolean;
  etfApplicable: boolean;
}

export interface EarningsBases {
  allowancesCents: number;
  deductionsCents: number;
  /** basePay + incentive + every allowance — the true gross pay figure. */
  grossCents: number;
  /**
   * basePay + only the allowances marked `epfApplicable` — deliberately
   * excludes incentive/commission (DECISIONS.md §62/§69's sourced finding:
   * "excluded [from EPF]: overtime payments, reimbursable traveling
   * expenses, and incentive/bonus payments").
   */
  epfApplicableEarningsCents: number;
  etfApplicableEarningsCents: number;
}

/**
 * Folds a staff member's active allowances/deductions into the bases the
 * statutory engine and the final net figure both need. Pure and
 * unit-tested so `PayrollPreviewService` (the one place components are
 * fetched and summed) can't quietly drift from what the run/statutory
 * services expect to read off its result.
 */
export function computeEarningsBases(basePayCents: number, incentiveCents: number, components: PayComponentLine[]): EarningsBases {
  const allowances = components.filter((c) => c.kind === PayComponentKind.ALLOWANCE);
  const deductions = components.filter((c) => c.kind === PayComponentKind.DEDUCTION);

  const allowancesCents = allowances.reduce((sum, c) => sum + c.amountCents, 0);
  const deductionsCents = deductions.reduce((sum, c) => sum + c.amountCents, 0);
  const epfAllowancesCents = allowances.filter((c) => c.epfApplicable).reduce((sum, c) => sum + c.amountCents, 0);
  const etfAllowancesCents = allowances.filter((c) => c.etfApplicable).reduce((sum, c) => sum + c.amountCents, 0);

  return {
    allowancesCents,
    deductionsCents,
    grossCents: basePayCents + incentiveCents + allowancesCents,
    epfApplicableEarningsCents: basePayCents + epfAllowancesCents,
    etfApplicableEarningsCents: basePayCents + etfAllowancesCents,
  };
}
