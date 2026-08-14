import { AppointmentStatus, SlotHoldStatus } from "@salon/shared";

/** Statuses that occupy staff time — mirrors the GiST exclusion constraint's WHERE clause (DATABASE.md §3.1). */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING_PAYMENT,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_SERVICE,
];

export const ACTIVE_SLOT_HOLD_STATUS = SlotHoldStatus.HELD;
