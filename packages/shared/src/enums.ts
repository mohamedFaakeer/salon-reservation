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
  /** A bank/wallet QR code the customer scans — staff confirm it visually, same manual trust model as CASH/BANK_TRANSFER. No live gateway. */
  QR = "QR",
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

/**
 * The append-only stock ledger's own vocabulary (`stock_movement.type`).
 * Every physical or corrective change in `quantityOnHand` is exactly one of
 * these, and the row that records it is never edited or deleted afterward —
 * a stricter version of CLAUDE.md's "no hard deletes on business records".
 */
export enum StockMovementType {
  RECEIPT = "RECEIPT",
  SALE = "SALE",
  RETURN_RESTOCK = "RETURN_RESTOCK",
  RETURN_QUARANTINE = "RETURN_QUARANTINE",
  ADJUSTMENT = "ADJUSTMENT",
  WRITE_OFF = "WRITE_OFF",
}

/**
 * One physical lot or serialised unit's own lifecycle. ACTIVE is sellable;
 * DEPLETED means `quantityRemaining` reached zero through ordinary sale;
 * QUARANTINED and WRITTEN_OFF are staff-driven corrections (a Phase B return
 * or a manual write-off) that pull stock out of the sellable pool without
 * pretending it was sold.
 */
export enum StockBatchStatus {
  ACTIVE = "ACTIVE",
  DEPLETED = "DEPLETED",
  QUARANTINED = "QUARANTINED",
  WRITTEN_OFF = "WRITTEN_OFF",
}

/**
 * A retail checkout's own lifecycle. RETURNED/PARTIALLY_RETURNED are Phase B
 * (`retail_return`); Phase A only ever writes COMPLETED, but the column
 * exists now so a Phase B migration never has to touch already-written rows.
 */
export enum RetailSaleStatus {
  COMPLETED = "COMPLETED",
  RETURNED = "RETURNED",
  PARTIALLY_RETURNED = "PARTIALLY_RETURNED",
}

/**
 * What happens to a returned unit. RESTOCK puts it back into sellable stock
 * (a new batch, or the same serial reactivated); QUARANTINE is a pure
 * record — it never re-enters `quantityOnHand`, because it isn't sellable.
 */
export enum RetailReturnDisposition {
  RESTOCK = "RESTOCK",
  QUARANTINE = "QUARANTINE",
}

/**
 * How often an employment record is paid — the two frequencies confirmed for
 * v1 of the Payroll module (DECISIONS.md §62). Monthly-salaried and
 * daily-waged staff are both first-class from the start, not one bolted onto
 * the other later, per the product decision behind that entry.
 */
export enum PayFrequency {
  MONTHLY = "MONTHLY",
  DAILY = "DAILY",
}

/**
 * A payroll run's own lifecycle (DECISIONS.md §66) — the maker-checker
 * shape spec §13 describes, simplified to what MANAGE_PAYROLL's current
 * single permission can actually enforce: a real separate approval action
 * is required, tracked by a distinct actor, but the same role may hold
 * both permissions (a stronger prepare-vs-approve split is a possible
 * future refinement, not built yet). VOID supersedes rather than edits —
 * same reasoning as `IncentivePayoutStatus`.
 */
export enum PayrollRunStatus {
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  PAID = "PAID",
  VOID = "VOID",
}

/**
 * How a payroll run was actually paid out — deliberately its own narrow
 * enum rather than reusing `PaymentMethod` (spec §15), which is customer-
 * payment-shaped (CARD_CAPTURED, QR, GATEWAY, GIFT_CARD, ...) and mostly
 * meaningless for paying staff. MIXED covers "some cash, some bank" without
 * needing a per-staff payment-method breakdown in v1.
 */
export enum PayrollPaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  MIXED = "MIXED",
}

export enum PayComponentKind {
  ALLOWANCE = "ALLOWANCE",
  DEDUCTION = "DEDUCTION",
}

/**
 * Payroll module, Phase 6 (DECISIONS.md §69) — a curated fixed list rather
 * than an owner-typed generic catalog, confirmed with the product owner:
 * covers the common Sri Lankan salon cases from the spec without the long
 * tail (acting allowance, union dues, court orders, ...) that a small salon
 * doesn't need. `OTHER_DEDUCTION` is the one deliberate escape hatch, and
 * requires a typed reason — a one-off case that doesn't fit a preset
 * category, not a way to reintroduce a free-form catalog through the back
 * door.
 */
export enum PayComponentType {
  TRANSPORT = "TRANSPORT",
  MEAL = "MEAL",
  ATTENDANCE = "ATTENDANCE",
  PHONE = "PHONE",
  UNIFORM = "UNIFORM",
  COST_OF_LIVING = "COST_OF_LIVING",
  SALARY_ADVANCE_RECOVERY = "SALARY_ADVANCE_RECOVERY",
  LOAN_REPAYMENT = "LOAN_REPAYMENT",
  UNIFORM_EQUIPMENT_RECOVERY = "UNIFORM_EQUIPMENT_RECOVERY",
  OTHER_DEDUCTION = "OTHER_DEDUCTION",
}

/** Which side of pay each fixed type belongs to — the single place this mapping lives, shared by validation and display. */
export const PAY_COMPONENT_KIND: Record<PayComponentType, PayComponentKind> = {
  [PayComponentType.TRANSPORT]: PayComponentKind.ALLOWANCE,
  [PayComponentType.MEAL]: PayComponentKind.ALLOWANCE,
  [PayComponentType.ATTENDANCE]: PayComponentKind.ALLOWANCE,
  [PayComponentType.PHONE]: PayComponentKind.ALLOWANCE,
  [PayComponentType.UNIFORM]: PayComponentKind.ALLOWANCE,
  [PayComponentType.COST_OF_LIVING]: PayComponentKind.ALLOWANCE,
  [PayComponentType.SALARY_ADVANCE_RECOVERY]: PayComponentKind.DEDUCTION,
  [PayComponentType.LOAN_REPAYMENT]: PayComponentKind.DEDUCTION,
  [PayComponentType.UNIFORM_EQUIPMENT_RECOVERY]: PayComponentKind.DEDUCTION,
  [PayComponentType.OTHER_DEDUCTION]: PayComponentKind.DEDUCTION,
};

export const PAY_COMPONENT_LABEL: Record<PayComponentType, string> = {
  [PayComponentType.TRANSPORT]: "Transport allowance",
  [PayComponentType.MEAL]: "Meal allowance",
  [PayComponentType.ATTENDANCE]: "Attendance allowance",
  [PayComponentType.PHONE]: "Phone/data allowance",
  [PayComponentType.UNIFORM]: "Uniform allowance",
  [PayComponentType.COST_OF_LIVING]: "Cost-of-living allowance",
  [PayComponentType.SALARY_ADVANCE_RECOVERY]: "Salary advance recovery",
  [PayComponentType.LOAN_REPAYMENT]: "Loan repayment",
  [PayComponentType.UNIFORM_EQUIPMENT_RECOVERY]: "Uniform/equipment recovery",
  [PayComponentType.OTHER_DEDUCTION]: "Other deduction",
};

/**
 * Sri Lanka's 9 administrative provinces. A fixed, real-world geographic
 * list — unlike `Customer.title`/`clientSource`, which are tenant-editable
 * free text, this has no per-tenant customization mechanism, the same
 * reasoning `BookingSource` already follows for its own small fixed set.
 */
export enum Province {
  WESTERN = "WESTERN",
  CENTRAL = "CENTRAL",
  SOUTHERN = "SOUTHERN",
  NORTHERN = "NORTHERN",
  EASTERN = "EASTERN",
  NORTH_WESTERN = "NORTH_WESTERN",
  NORTH_CENTRAL = "NORTH_CENTRAL",
  UVA = "UVA",
  SABARAGAMUWA = "SABARAGAMUWA",
}

/**
 * The Customers page's quick-filter segments. `FIRST_VISIT` and `WEB` are
 * structural conditions (no day-window); `NEW`/`RECENT`/`UPCOMING_BIRTHDAY`
 * each read a tenant-configurable day-window from
 * `TenantSettings.customerSegmentSettings`. Computed live on every request
 * (CustomerService), never stored as a per-customer flag — see DECISIONS.md.
 */
export enum CustomerSegment {
  NEW = "NEW",
  RECENT = "RECENT",
  FIRST_VISIT = "FIRST_VISIT",
  UPCOMING_BIRTHDAY = "UPCOMING_BIRTHDAY",
  WEB = "WEB",
}
