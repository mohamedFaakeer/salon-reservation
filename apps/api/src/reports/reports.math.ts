import { AppointmentStatus } from "@salon/shared";
import { dayOfWeekOf } from "../availability/time.util";
import type { LossReport, ServiceCount } from "./reports.types";

/**
 * The arithmetic behind the reports, with the database left outside.
 *
 * These are the parts where a mistake is silent — a rota that forgets leave, a
 * no-show rate that reads as spotless because nothing concluded — so they are
 * pure functions that can be tested on their own rather than through eleven
 * mocked repositories.
 */

export interface ShiftLike {
  staffId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
}

export interface DateSpan {
  startDate: string;
  endDate: string;
}

export interface LeaveLike extends DateSpan {
  staffId: string;
}

export interface LossRow {
  status: AppointmentStatus;
  staffId: string;
  staffName: string | null;
  totalCents: number;
  advancePaidCents: number;
  hour: number;
}

/**
 * Minutes the rota actually put each stylist on the floor.
 *
 * A leave day or a salon closure removes the whole day rather than being
 * prorated: half-day leave is not something this schema models, and pretending
 * to more precision than the data holds would be invention. A closure removes
 * the day for everyone, which is why it is checked before the staff loop.
 */
export function computeRosteredMinutes(
  dates: string[],
  shifts: ShiftLike[],
  leaves: LeaveLike[],
  closures: DateSpan[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const date of dates) {
    if (closures.some((c) => c.startDate <= date && date <= c.endDate)) {
      continue;
    }
    const dow = dayOfWeekOf(date);

    for (const shift of shifts) {
      if (shift.dayOfWeek !== dow) {
        continue;
      }
      const onLeave = leaves.some(
        (l) => l.staffId === shift.staffId && l.startDate <= date && date <= l.endDate,
      );
      if (onLeave) {
        continue;
      }
      totals.set(shift.staffId, (totals.get(shift.staffId) ?? 0) + shiftMinutes(shift));
    }
  }

  return totals;
}

function shiftMinutes(shift: ShiftLike): number {
  const breakMinutes =
    shift.breakStartMin !== null && shift.breakEndMin !== null
      ? Math.max(0, shift.breakEndMin - shift.breakStartMin)
      : 0;
  return Math.max(0, shift.endMin - shift.startMin - breakMinutes);
}

/**
 * What the empty chairs cost, and whether a deposit prevented them.
 *
 * Only NO_SHOW and COMPLETED feed the deposit comparison. A cancellation made
 * inside the salon's own policy window is the customer doing the right thing,
 * and counting it against the deposit rule would answer a different question
 * than the one this panel asks.
 */
export function tallyLosses(rows: LossRow[]): LossReport {
  const byStaff = new Map<string, LossReport["byStaff"][number]>();
  const byHour = new Map<number, LossReport["byHour"][number]>();
  const withDeposit = { concluded: 0, noShows: 0 };
  const withoutDeposit = { concluded: 0, noShows: 0 };

  let noShows = 0;
  let cancellations = 0;
  let lostRevenueCents = 0;

  for (const row of rows) {
    const isNoShow = row.status === AppointmentStatus.NO_SHOW;
    const isCancelled = row.status === AppointmentStatus.CANCELLED;

    if (isNoShow || row.status === AppointmentStatus.COMPLETED) {
      const bucket = Number(row.advancePaidCents) > 0 ? withDeposit : withoutDeposit;
      bucket.concluded += 1;
      if (isNoShow) {
        bucket.noShows += 1;
      }
    }

    if (!isNoShow && !isCancelled) {
      continue;
    }

    noShows += isNoShow ? 1 : 0;
    cancellations += isCancelled ? 1 : 0;
    lostRevenueCents += Number(row.totalCents);

    const staffEntry = byStaff.get(row.staffId) ?? {
      staffId: row.staffId,
      // A departed stylist's row survives with a null join, and their
      // no-shows are still part of what the period cost.
      name: row.staffName ?? "Removed stylist",
      noShows: 0,
      cancellations: 0,
      lostCents: 0,
    };
    staffEntry.noShows += isNoShow ? 1 : 0;
    staffEntry.cancellations += isCancelled ? 1 : 0;
    staffEntry.lostCents += Number(row.totalCents);
    byStaff.set(row.staffId, staffEntry);

    const hour = Number(row.hour);
    const hourEntry = byHour.get(hour) ?? { hour, noShows: 0, cancellations: 0 };
    hourEntry.noShows += isNoShow ? 1 : 0;
    hourEntry.cancellations += isCancelled ? 1 : 0;
    byHour.set(hour, hourEntry);
  }

  return {
    noShows,
    cancellations,
    lostRevenueCents,
    byStaff: [...byStaff.values()].sort((a, b) => b.lostCents - a.lostCents),
    byHour: [...byHour.values()].sort((a, b) => a.hour - b.hour),
    depositEffect: { withDeposit: withRate(withDeposit), withoutDeposit: withRate(withoutDeposit) },
  };
}

/** Null, never zero, on an empty denominator: nothing concluded is not a spotless record. */
export function withRate(bucket: { concluded: number; noShows: number }): {
  concluded: number;
  noShows: number;
  noShowPercent: number | null;
} {
  return {
    ...bucket,
    noShowPercent:
      bucket.concluded === 0 ? null : Math.round((bucket.noShows / bucket.concluded) * 100),
  };
}

/** Median, not mean: one inquiry forgotten for a year should not move it. */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
}

/**
 * The same rows ranked two ways.
 *
 * Split here rather than run as two queries because the point is where the
 * lists disagree: a cheap fringe trim can top the popularity list while
 * contributing almost nothing to the takings.
 */
export function rankServices(
  rows: ServiceCount[],
  topN: number,
): { popular: ServiceCount[]; byRevenue: ServiceCount[] } {
  return {
    popular: [...rows].sort((a, b) => b.count - a.count).slice(0, topN),
    byRevenue: [...rows].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, topN),
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function percentOrNull(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
