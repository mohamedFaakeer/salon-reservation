import type { BasePayPreviewView } from "./base-pay.types";
import type { PayComponentView } from "./pay-component.types";

export interface PayrollIncentiveComponent {
  /** A frozen, already-finalized payout for this exact period, or a live unsaved estimate if none has been run yet. */
  source: "FINALIZED_PAYOUT" | "LIVE_ESTIMATE";
  totalCents: number;
  /** Set only when `source` is `FINALIZED_PAYOUT`. */
  payoutId: string | null;
}

export interface PayrollPreviewView {
  staffId: string;
  staffName: string;
  from: string;
  to: string;
  basePay: BasePayPreviewView;
  /** `null` when the tenant doesn't have Incentives enabled, or this staff member has no plan assigned. */
  incentive: PayrollIncentiveComponent | null;
  /** Every active allowance/deduction, for display — see `pay-component.domain.ts` for how they fold into the figures below. */
  payComponents: PayComponentView[];
  allowancesCents: number;
  deductionsCents: number;
  /** basePay + only the EPF-applicable allowances — never incentive/commission (DECISIONS.md §69). */
  epfApplicableEarningsCents: number;
  etfApplicableEarningsCents: number;
  /** Gross: basePay + incentive + every allowance. Deductions are applied after statutory, by whichever service computes the final net (`PayrollRunService`/`StatutoryPreviewService`), not here. */
  totalCents: number;
}
