import { ApiError } from "@salon/shared";
import { colomboNow, daysBetween } from "../availability/time.util";

/** A year and a day. Wide enough for "this year", narrow enough to stay a scan. */
export const MAX_RANGE_DAYS = 366;

/** Minutes Colombo runs ahead of UTC. Fixed — Sri Lanka has no DST. */
const COLOMBO_OFFSET_MINUTES = 330;

export interface ResolvedRange {
  /** Tenant-local `YYYY-MM-DD`, inclusive. */
  from: string;
  to: string;
  /** Inclusive day count: a single day is 1, not 0. */
  days: number;
  /** True when "now" falls inside the range — the only case live counts mean anything. */
  includesToday: boolean;
  /** Today in Colombo, for callers that need it. */
  today: string;
}

/**
 * The one place a reporting date range is interpreted.
 *
 * Extracted from DashboardService when the reports module needed the same
 * contract. Two implementations would disagree the first time one of them
 * changed, and a dashboard and a report that quietly cover different days is
 * the kind of bug nobody reports because both screens look plausible.
 *
 * Omitting both dates means today; omitting only `to` means a single day.
 */
export function resolveDateRange(from: string | undefined, to: string | undefined, now: Date): ResolvedRange {
  const today = colomboNow(now).date;
  const start = from ?? today;
  const end = to ?? start;

  if (end < start) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_DATE_RANGE",
      message: "The end date must be on or after the start date.",
    });
  }
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    throw new ApiError({
      statusCode: 400,
      code: "DATE_RANGE_TOO_WIDE",
      message: `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`,
    });
  }

  return {
    from: start,
    to: end,
    days: daysBetween(start, end) + 1,
    includesToday: start <= today && today <= end,
    today,
  };
}

/**
 * The half-open UTC window a local date range covers.
 *
 * Appointments are filtered by `appointmentDate`, which is already a local
 * calendar date, but payments and ratings carry timestamps. Comparing a
 * timestamp against a bare date silently uses UTC midnight, which is 05:30
 * Colombo — so a payment taken at 4am would land in the previous day's report.
 *
 * The end is exclusive so that the last day is included whole, without relying
 * on `23:59:59.999` being the largest representable instant of a day.
 */
export function utcWindowFor(range: { from: string; to: string }): { startUtc: Date; endUtc: Date } {
  const localMidnightUtc = (date: string, addDays: number): Date =>
    new Date(
      Date.parse(`${date}T00:00:00Z`) - COLOMBO_OFFSET_MINUTES * 60_000 + addDays * 86_400_000,
    );

  return {
    startUtc: localMidnightUtc(range.from, 0),
    endUtc: localMidnightUtc(range.to, 1),
  };
}

/** Every local calendar date in the range, inclusive. */
export function datesIn(range: { from: string; to: string }): string[] {
  const out: string[] = [];
  const end = Date.parse(`${range.to}T00:00:00Z`);
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
