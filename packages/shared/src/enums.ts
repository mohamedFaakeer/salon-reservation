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
