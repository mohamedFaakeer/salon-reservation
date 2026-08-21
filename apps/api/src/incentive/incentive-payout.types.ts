export interface IncentivePayoutSnapshot {
  plan: {
    name: string;
    baseCommissionPercent: number | null;
    perJobAmountCents: number | null;
    monthlyTargetCents: number | null;
    tierBonusPercent: number | null;
    serviceRates: Array<{ serviceId: string; serviceName: string; ratePercent: number }>;
  };
  lines: Array<{
    appointmentId: string;
    bookingReference: string;
    serviceId: string | null;
    serviceName: string;
    chargedCents: number;
    receivedCents: number;
  }>;
}

export interface IncentivePayoutView {
  id: string;
  staffId: string;
  staffName: string;
  planId: string | null;
  planName: string;
  periodStart: string;
  periodEnd: string;
  status: "FINALISED" | "PAID" | "VOID";
  revenueCents: number;
  commissionCents: number;
  jobsCompleted: number;
  perJobCents: number;
  tierBonusCents: number;
  totalCents: number;
  snapshot: IncentivePayoutSnapshot;
  supersedesPayoutId: string | null;
  finalisedByName: string;
  paidAt: string | null;
  paidByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdAt: string;
}
