import { AttendanceDayStatus } from "@salon/shared";
import { colomboNow, localMinutesToUtc } from "../availability/time.util";

/**
 * Everything the attendance feature knows how to work out, as pure functions.
 *
 * Nothing here reads a repository or a clock. The service supplies the facts,
 * this decides what they mean, and the same code answers "is she late?" for a
 * punch being written, a month being reported and a correction being approved
 * — which is the only way those three can be guaranteed to agree.
 */

/**
 * Minutes from local midnight *of a named date*, which is not the same as the
 * minute-of-day of the instant.
 *
 * A stylist who finishes a colour at 00:20 checked out on the previous day's
 * shift. Reading her check-out as "minute 20" would score her as leaving
 * twenty hours early; reading it as minute 1460 of the day she started scores
 * her as staying late, which is what happened.
 */
export function minutesFromMidnightOf(workDate: string, at: Date): number {
  const midnight = localMinutesToUtc(workDate, 0).getTime();
  return Math.round((at.getTime() - midnight) / 60_000);
}

/** Which Colombo-local day a punch belongs to. */
export function workDateOf(at: Date): string {
  return colomboNow(at).date;
}

/**
 * How late, past the salon's own allowance.
 *
 * Returns 0 rather than a negative number for an early arrival: turning up at
 * ten to nine is not "minus ten minutes late", and a column that mixed the two
 * would make a month's total meaningless.
 */
export function lateMinutesFor(
  expectedStartMin: number | null,
  graceMinutes: number,
  arrivedMin: number,
): number {
  if (expectedStartMin === null) {
    return 0;
  }
  return Math.max(0, arrivedMin - (expectedStartMin + graceMinutes));
}

/** The same at the other end of the shift. */
export function earlyMinutesFor(
  expectedEndMin: number | null,
  graceMinutes: number,
  leftMin: number,
): number {
  if (expectedEndMin === null) {
    return 0;
  }
  return Math.max(0, expectedEndMin - graceMinutes - leftMin);
}

export function workedMinutesBetween(checkInAt: Date, checkOutAt: Date): number {
  return Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000));
}

export interface DayFacts {
  hasCheckIn: boolean;
  hasCheckOut: boolean;
  /** A rota row exists for this weekday. */
  rostered: boolean;
  onLeave: boolean;
  closed: boolean;
  /** The shift's end has passed, or the date itself is behind us. */
  dayIsOver: boolean;
}

/**
 * What the day amounts to.
 *
 * The order of these branches is the rule, not an implementation detail: a
 * recorded punch outranks every plan above it. Somebody rostered off who came
 * in to cover, or on leave who dropped in anyway, was *present* — and a system
 * that reported DAY_OFF because the rota said so would be arguing with a
 * person who was standing in the salon.
 */
export function resolveStatus(facts: DayFacts): AttendanceDayStatus {
  if (facts.hasCheckIn) {
    if (facts.hasCheckOut || !facts.dayIsOver) {
      return AttendanceDayStatus.PRESENT;
    }
    return AttendanceDayStatus.MISSING_CHECK_OUT;
  }
  if (facts.closed) {
    return AttendanceDayStatus.CLOSED;
  }
  if (facts.onLeave) {
    return AttendanceDayStatus.ON_LEAVE;
  }
  if (!facts.rostered) {
    return AttendanceDayStatus.DAY_OFF;
  }
  return facts.dayIsOver ? AttendanceDayStatus.ABSENT : AttendanceDayStatus.EXPECTED;
}

/**
 * Whether the working day is behind us, for a date being read *now*.
 *
 * A past date is always over. Today is over for a given person only once
 * their rostered shift has ended — which is what makes "she never came in"
 * sayable at six in the evening instead of only tomorrow morning. Someone with
 * no rota that day has no end to have passed, so their today is never over.
 */
export function dayIsOver(
  workDate: string,
  expectedEndMin: number | null,
  now: Date,
): boolean {
  const local = colomboNow(now);
  if (workDate < local.date) {
    return true;
  }
  if (workDate > local.date) {
    return false;
  }
  return expectedEndMin !== null && local.minutes >= expectedEndMin;
}
