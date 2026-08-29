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
   * How many minutes past the rostered start still counts as on time.
   *
   * Without one, arriving at 09:00:40 is "late" and the attendance report
   * fills with noise nobody reads — which is how a report stops being looked
   * at. Zero means the rota is the rota.
   */
  attendanceGraceMinutes: number;
  /**
   * The same allowance at the other end of the shift, kept separate because
   * salons rarely treat the two the same: a stylist who stays until the last
   * customer leaves is not owed the same latitude as one who arrives after
   * the doors open.
   */
  earlyDepartureGraceMinutes: number;
  /**
   * Printed on invoices when set, omitted entirely when not. Sri Lankan
   * invoices usually carry one, but nothing in the product needs it, so a
   * salon that has not filled it in gets a clean document rather than an
   * empty label.
   */
  businessRegNo?: string | null;
  /**
   * The Cloudinary URL of the salon's uploaded logo. Shown on the admin
   * navbar and printed on invoices (frozen into the invoice snapshot at
   * issue time, same as `businessRegNo`); `null` falls back to a text-only
   * treatment wherever it would otherwise appear.
   */
  logoUrl?: string | null;
  /**
   * Governs only the notification bell's non-blocking popup for a new
   * online booking/cancellation/reschedule — never the badge/drawer itself,
   * which always reflects reality and has no override. Defaults to `true`;
   * a salon that finds the popup intrusive can turn it off without losing
   * the underlying notification.
   */
  staffNotificationPopupsEnabled: boolean;
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
  attendanceGraceMinutes: 10,
  earlyDepartureGraceMinutes: 10,
  businessRegNo: null,
  logoUrl: null,
  staffNotificationPopupsEnabled: true,
};
