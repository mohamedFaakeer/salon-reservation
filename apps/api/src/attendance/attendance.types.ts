import type { AttendanceDayStatus } from "@salon/shared";

/** One staff member's one day, as every attendance screen reads it. */
export interface AttendanceDayView {
  /** Null when nobody has punched — the day is a derived verdict, not a row. */
  id: string | null;
  staffId: string;
  staffName: string;
  workDate: string;
  status: AttendanceDayStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Minutes since local midnight; null when the person was not rostered. */
  expectedStartMin: number | null;
  expectedEndMin: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number | null;
  /**
   * True when the punch came from the staff member's own login. The front
   * desk punching somebody in is a different kind of record, and a screen
   * that showed them identically would be hiding the difference.
   */
  selfRecorded: boolean;
  recordedByName: string | null;
}

/** What a range adds up to for one person. */
export interface AttendanceStaffSummary {
  staffId: string;
  staffName: string;
  presentDays: number;
  lateDays: number;
  lateMinutes: number;
  earlyDays: number;
  earlyMinutes: number;
  absentDays: number;
  missingCheckOutDays: number;
  leaveDays: number;
  workedMinutes: number;
  /** Days they were rostered to work, whether or not they did. */
  rosteredDays: number;
}

export interface AttendanceReport {
  range: { from: string; to: string; days: number };
  summary: AttendanceStaffSummary[];
  days: AttendanceDayView[];
}
