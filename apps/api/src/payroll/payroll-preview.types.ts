import type { BasePayPreviewView } from "./base-pay.types";

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
  totalCents: number;
}
