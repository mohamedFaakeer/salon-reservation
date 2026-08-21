export interface IncentivePlanView {
  id: string;
  name: string;
  baseCommissionPercent: number | null;
  perJobAmountCents: number | null;
  monthlyTargetCents: number | null;
  tierBonusPercent: number | null;
  active: boolean;
  serviceRates: Array<{ serviceId: string; serviceName: string; ratePercent: number }>;
}

export interface IncentivePreviewRow {
  staffId: string;
  staffName: string;
  planId: string;
  planName: string;
  revenueCents: number;
  commissionCents: number;
  jobsCompleted: number;
  perJobCents: number;
  tierBonusCents: number;
  totalCents: number;
}
