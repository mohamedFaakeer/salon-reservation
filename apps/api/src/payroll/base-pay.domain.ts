import { AttendanceDayStatus, PayFrequency } from "@salon/shared";

/**
 * One day's inputs for the base-pay calculation — everything about that date
 * that affects whether, and how much, it earns, gathered by
 * `BasePayService` from Employment, Attendance, and StaffLeave.
 */
export interface BasePayDayInput {
  date: string;
  /** `null` when no Employment version covers this date — nothing to base pay on. */
  payFrequency: PayFrequency | null;
  baseRateCents: number | null;
  attendanceStatus: AttendanceDayStatus;
  /**
   * Only meaningful when `attendanceStatus` is `ON_LEAVE` — whether the
   * covering `StaffLeave` row(s) are paid. `null` otherwise, or when no
   * leave record actually covers the date despite the status (shouldn't
   * happen, but treated as unpaid rather than assumed).
   */
  leavePaid: boolean | null;
}

export type BasePayDayNote =
  | "NO_EMPLOYMENT"
  | "MONTHLY_DAY"
  | "UNPAID_ABSENCE"
  | "WORKED"
  | "PAID_LEAVE"
  | "UNPAID_LEAVE"
  | "CLOSURE_UNRESOLVED"
  | "NOT_PAYABLE";

export interface BasePayDayResult {
  date: string;
  payFrequency: PayFrequency | null;
  earnedCents: number;
  note: BasePayDayNote;
}

export interface BasePayResult {
  earnedCents: number;
  unpaidAbsenceDays: number;
  /**
   * A day the salon was closed (a Poya day, a public holiday, or any other
   * closure) for a DAILY-wage staff member. Deliberately NOT auto-resolved
   * to paid or unpaid — Sri Lankan law on paid weekly/public-holiday
   * entitlement for daily-rated workers needs its own statutory
   * verification (DECISIONS.md §62), the same "flag, don't guess" treatment
   * already applied to EPF/ETF/APIT. Always earns 0 in this total until
   * that's resolved, but surfaced separately so nobody mistakes silence for
   * a considered answer.
   */
  unresolvedClosureDays: number;
  daysWithoutEmployment: number;
  days: BasePayDayResult[];
}

/**
 * Turns one staff member's day-by-day inputs into a base-pay figure.
 *
 * Deliberately per-day rather than per-period: a pay-rate change or a
 * MONTHLY→DAILY switch mid-period falls out for free by just changing what
 * `payFrequency`/`baseRateCents` a given date carries, with no separate
 * segment-splitting logic to keep in sync with Employment's own versioning.
 *
 * Business rules encoded here (DECISIONS.md §62, confirmed with the product
 * owner, not assumed):
 *   - MONTHLY: a confirmed unpaid absence (`AttendanceDayStatus.ABSENT` — a
 *     day that was rostered, is over, and has nothing recorded) deducts
 *     exactly one thirtieth of the monthly rate; every other day earns that
 *     same thirtieth, whatever the actual number of days in the period.
 *   - DAILY: a worked day (present, or present with a missing checkout — a
 *     punch problem, not an absence) earns the full daily rate; an ON_LEAVE
 *     day earns it only if the covering leave is marked paid; a closure day
 *     is left unresolved rather than guessed; anything else (an unrostered
 *     day off, an unauthorised absence, a day not yet over) earns nothing.
 */
export function computeBasePay(days: BasePayDayInput[]): BasePayResult {
  const results = days.map(computeBasePayDay);
  return {
    earnedCents: results.reduce((sum, r) => sum + r.earnedCents, 0),
    unpaidAbsenceDays: results.filter((r) => r.note === "UNPAID_ABSENCE").length,
    unresolvedClosureDays: results.filter((r) => r.note === "CLOSURE_UNRESOLVED").length,
    daysWithoutEmployment: results.filter((r) => r.note === "NO_EMPLOYMENT").length,
    days: results,
  };
}

function computeBasePayDay(input: BasePayDayInput): BasePayDayResult {
  const { date, payFrequency, baseRateCents, attendanceStatus, leavePaid } = input;

  if (payFrequency === null || baseRateCents === null) {
    return { date, payFrequency: null, earnedCents: 0, note: "NO_EMPLOYMENT" };
  }

  if (payFrequency === PayFrequency.MONTHLY) {
    if (attendanceStatus === AttendanceDayStatus.ABSENT) {
      return { date, payFrequency, earnedCents: 0, note: "UNPAID_ABSENCE" };
    }
    return { date, payFrequency, earnedCents: Math.round(baseRateCents / 30), note: "MONTHLY_DAY" };
  }

  // DAILY
  if (attendanceStatus === AttendanceDayStatus.PRESENT || attendanceStatus === AttendanceDayStatus.MISSING_CHECK_OUT) {
    return { date, payFrequency, earnedCents: baseRateCents, note: "WORKED" };
  }
  if (attendanceStatus === AttendanceDayStatus.ON_LEAVE) {
    return leavePaid
      ? { date, payFrequency, earnedCents: baseRateCents, note: "PAID_LEAVE" }
      : { date, payFrequency, earnedCents: 0, note: "UNPAID_LEAVE" };
  }
  if (attendanceStatus === AttendanceDayStatus.CLOSED) {
    return { date, payFrequency, earnedCents: 0, note: "CLOSURE_UNRESOLVED" };
  }
  return { date, payFrequency, earnedCents: 0, note: "NOT_PAYABLE" };
}
