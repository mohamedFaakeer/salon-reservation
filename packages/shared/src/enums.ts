/**
 * Shared domain enums for the Salon Reservation SaaS MVP.
 * Single source of truth consumed by apps/api, apps/web, apps/admin.
 */

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  RECEPTIONIST = "RECEPTIONIST",
  STAFF = "STAFF",
}

export enum AppointmentStatus {
  PENDING_PAYMENT = "PENDING_PAYMENT",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  IN_SERVICE = "IN_SERVICE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
  EXPIRED = "EXPIRED",
  RESCHEDULED = "RESCHEDULED",
}

export enum BookingSource {
  ONLINE = "ONLINE",
  RECEPTIONIST = "RECEPTIONIST",
  WALK_IN = "WALK_IN",
  PHONE = "PHONE",
  WHATSAPP = "WHATSAPP",
}

export enum SlotHoldStatus {
  HELD = "HELD",
  CONSUMED = "CONSUMED",
  RELEASED = "RELEASED",
  EXPIRED = "EXPIRED",
}

/** CLAUDE.md §1.6: PENDING → SUCCESS | FAILED | REQUIRES_RECONCILIATION; refund states folded into the same field per DATABASE.md §2.5. */
export enum PaymentStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  REFUNDED = "REFUNDED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  REQUIRES_RECONCILIATION = "REQUIRES_RECONCILIATION",
}

export enum RefundStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export enum PaymentProviderName {
  MANUAL = "manual",
  PAYHERE = "payhere",
}

export enum PaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CARD_CAPTURED = "CARD_CAPTURED",
  ONLINE = "ONLINE",
  GATEWAY = "GATEWAY",
  GIFT_CARD = "GIFT_CARD",
  PACKAGE_CREDIT = "PACKAGE_CREDIT",
}

export enum PaymentType {
  ADVANCE = "ADVANCE",
  FULL = "FULL",
  BALANCE = "BALANCE",
}

export enum PaymentAttemptStatus {
  RECEIVED = "RECEIVED",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
}

export enum AdvanceRule {
  NO_ADVANCE = "NO_ADVANCE",
  FIXED_AMOUNT = "FIXED_AMOUNT",
  PERCENTAGE = "PERCENTAGE",
  FULL_PAYMENT = "FULL_PAYMENT",
}

export enum NotificationChannel {
  CONSOLE = "console",
  EMAIL = "email",
  SMS = "sms",
  WHATSAPP = "whatsapp",
}

export enum NotificationStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
  RETRYING = "RETRYING",
}

/** Matches DATABASE.md §2.6's `notification.type` column exactly. */
export enum NotificationEvent {
  BOOKING_CONFIRMATION = "BOOKING_CONFIRMATION",
  PAYMENT_CONFIRMATION = "PAYMENT_CONFIRMATION",
  REMINDER_24H = "REMINDER_24H",
  REMINDER_2H = "REMINDER_2H",
  CANCELLATION_CONFIRMATION = "CANCELLATION_CONFIRMATION",
  RESCHEDULE_CONFIRMATION = "RESCHEDULE_CONFIRMATION",
  NO_SHOW = "NO_SHOW",
  LATE_ARRIVAL = "LATE_ARRIVAL",
  /** A staff-triggered win-back message to a lapsed customer — the one event with no `Appointment` behind it. */
  WINBACK_OFFER = "WINBACK_OFFER",
}
/**
 * An inquiry is a question, not a reservation: "do you do bridal packages,
 * and what would it cost?" It holds no slot, blocks no stylist and never
 * reaches the availability engine — which is exactly why it is not an
 * Appointment. See DECISIONS.md.
 */
export enum InquiryStatus {
  /** Logged and still needing an answer. */
  OPEN = "OPEN",
  /** Became a real booking. `appointmentId` says which one. */
  CONVERTED = "CONVERTED",
  /** Dealt with, or went nowhere. Never deleted — CLAUDE.md rule §8. */
  CLOSED = "CLOSED",
}

/**
 * How a discount is expressed. Stored alongside the amount so the salon's own
 * intent survives: "20% off" and "LKR 1,000 off" can be the same money today
 * and different money after a price change, and a report that lost which one
 * was meant cannot explain either.
 */
export enum DiscountType {
  FIXED = "FIXED",
  PERCENT = "PERCENT",
}

/**
 * What a single staff member's single day amounts to.
 *
 * Ordered by how the verdict is reached rather than alphabetically, because
 * the order *is* the rule: a fact beats a plan. Somebody who was rostered off
 * but came in and punched is PRESENT, not DAY_OFF — the punch is the stronger
 * truth, and a rota that disagrees with a person standing in the salon is the
 * thing that is wrong.
 */
export enum AttendanceDayStatus {
  /** Checked in. Still here if there is no check-out and the day is not over. */
  PRESENT = "PRESENT",
  /**
   * Checked in, the day is over, and nobody ever checked out. Deliberately its
   * own state rather than a guess at a leaving time: people forget to punch
   * out far more often than they forget to punch in, and inventing the missing
   * half would be the system making up a fact about someone's day.
   */
  MISSING_CHECK_OUT = "MISSING_CHECK_OUT",
  /** The salon was closed. Nobody was expected. */
  CLOSED = "CLOSED",
  /** Approved leave covered this date. */
  ON_LEAVE = "ON_LEAVE",
  /** No rota row for this weekday — not a working day for this person. */
  DAY_OFF = "DAY_OFF",
  /** Rostered, the day is not over, and they have not arrived yet. Not absence. */
  EXPECTED = "EXPECTED",
  /** Rostered, the day is over, and nothing was ever recorded. */
  ABSENT = "ABSENT",
}

/**
 * The state of a request to change a recorded punch.
 *
 * There is no EDITED status: approving a request applies the new times to
 * the attendance row and the request itself simply becomes the record of
 * that having happened, same as an invoice version rather than a ticket that
 * gets closed and forgotten.
 */
export enum AttendanceEditRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  /** Withdrawn by whoever filed it, before anyone decided. */
  WITHDRAWN = "WITHDRAWN",
}

/** How the plan's monthly-target tier bonus, if any, has been finalised for a period. */
export enum IncentivePayoutStatus {
  FINALISED = "FINALISED",
  PAID = "PAID",
  /** Corrected by a later payout for the same staff and period. */
  VOID = "VOID",
}

/**
 * A gift card's own lifecycle. Deliberately has no EXPIRED value: expiry is
 * checked live against `expiresAt` at redemption time, never written back to
 * this column — the same reasoning `AttendanceDayStatus` and the daily
 * booking-limit flag use for anything time-derived, so nothing needs a
 * scheduled job to keep this column honest.
 */
export enum GiftCardStatus {
  ACTIVE = "ACTIVE",
  /** Balance reached zero through redemption. */
  REDEEMED = "REDEEMED",
  /** Corrected by whoever issued it — never redeemable again, whatever balance remained. */
  VOID = "VOID",
}

/**
 * A prepaid service package's own lifecycle — the same "no EXPIRED value"
 * reasoning as `GiftCardStatus`, and DEPLETED rather than REDEEMED: hitting
 * zero uses implies nothing about money, just that every visit was spent.
 */
export enum ServicePackageStatus {
  ACTIVE = "ACTIVE",
  /** Every use has been redeemed. */
  DEPLETED = "DEPLETED",
  /** Corrected by whoever issued it — never redeemable again, whatever uses remained. */
  VOID = "VOID",
}
