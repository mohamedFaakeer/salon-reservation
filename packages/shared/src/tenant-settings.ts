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
  /** FIXED_AMOUNT only, LKR cents. Ignored for PERCENTAGE — see `advancePercent`. */
  advanceValueCents: number | null;
  /** PERCENTAGE only, whole percent 0-100. Ignored for FIXED_AMOUNT — see `advanceValueCents`. */
  advancePercent: number | null;
  cancellationPolicy: CancellationPolicy;
  bookingWindowDays: number;
  sameDayLeadMinutes: number;
  noShowGraceMinutes: number;
  reminderOffsets: number[];
  /**
   * How much of a bill anyone who can take payment may give away unaided,
   * as a whole percent of what is still owed.
   *
   * Expressed as a percentage on purpose, so one number governs both a
   * percentage discount and a fixed one — a receptionist waving LKR 500 off a
   * LKR 800 bill is giving away 63%, however it was typed. Above this, an
   * owner or manager has to be the one to do it. Zero means nobody discounts
   * without that authority.
   */
  discountCapPercent: number;
  /**
   * Printed on invoices when set, omitted entirely when not. Sri Lankan
   * invoices usually carry one, but nothing in the product needs it, so a
   * salon that has not filled it in gets a clean document rather than an
   * empty label.
   */
  businessRegNo?: string | null;
}

/** DECISIONS.md Q5/Q9 defaults; advanceRule defaults to NO_ADVANCE. */
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  advanceRule: AdvanceRule.NO_ADVANCE,
  advanceValueCents: null,
  advancePercent: null,
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
  // Enough for the everyday goodwill gesture, not enough to waive a bill.
  discountCapPercent: 10,
  businessRegNo: null,
};
