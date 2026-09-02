import { PayFrequency } from "@salon/shared";

export interface PayCalendarConfig {
  monthlyAnchorDay: number;
}

export interface PayPeriod {
  start: string;
  end: string;
}

const DEFAULT_CALENDAR: PayCalendarConfig = { monthlyAnchorDay: 1 };

/**
 * The pay period (inclusive, `YYYY-MM-DD`) that a given date falls inside.
 *
 * DAILY periods are trivial — a day is a day. MONTHLY periods run from the
 * tenant's `monthlyAnchorDay` of one month to the day before that same anchor
 * day next month, so an anchor of 1 is an ordinary calendar month and an
 * anchor of 21 is a 21st-to-20th cycle. Pure and deterministic so it can be
 * asked about a past, current, or future date identically — no "now" involved.
 */
export function resolvePayPeriod(frequency: PayFrequency, referenceDate: string, calendar: PayCalendarConfig = DEFAULT_CALENDAR): PayPeriod {
  if (frequency === PayFrequency.DAILY) {
    return { start: referenceDate, end: referenceDate };
  }

  const anchor = calendar.monthlyAnchorDay;
  const { year, month, day } = parseDateOnly(referenceDate);

  let startYear = year;
  let startMonth = month;
  if (day < anchor) {
    startMonth -= 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear -= 1;
    }
  }

  let nextMonth = startMonth + 1;
  let nextYear = startYear;
  if (nextMonth === 13) {
    nextMonth = 1;
    nextYear += 1;
  }
  const end = addDays(formatDateOnly(nextYear, nextMonth, anchor), -1);

  return { start: formatDateOnly(startYear, startMonth, anchor), end };
}

/** One calendar day before `date` (`YYYY-MM-DD` in, `YYYY-MM-DD` out) — used to close the previous Employment version the instant a new one opens. */
export function dayBefore(date: string): string {
  return addDays(date, -1);
}

function addDays(date: string, delta: number): string {
  const { year, month, day } = parseDateOnly(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return formatDateOnly(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function parseDateOnly(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
