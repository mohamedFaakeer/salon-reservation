import { AdvanceRule } from "./enums";

export interface CancellationPolicy {
  selfServiceCutoffHours: number;
  refundPercentBeforeCutoff: number;
  refundPercentAfterCutoff: number;
  noShowRefundPercent: number;
}

/** Persisted shape of `tenant.settings` (API.md §3). */
export interface TenantSettings {
  advanceRule: AdvanceRule;
  advanceValueCents: number | null;
  cancellationPolicy: CancellationPolicy;
  bookingWindowDays: number;
  sameDayLeadMinutes: number;
  noShowGraceMinutes: number;
  reminderOffsets: number[];
}

/** DECISIONS.md Q5/Q9 defaults; advanceRule defaults to NO_ADVANCE. */
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  advanceRule: AdvanceRule.NO_ADVANCE,
  advanceValueCents: null,
  cancellationPolicy: {
    selfServiceCutoffHours: 2,
    refundPercentBeforeCutoff: 100,
    refundPercentAfterCutoff: 0,
    noShowRefundPercent: 0,
  },
  bookingWindowDays: 30,
  sameDayLeadMinutes: 120,
  noShowGraceMinutes: 15,
  reminderOffsets: [24, 2],
};
