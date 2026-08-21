import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, Repository } from "typeorm";
import { AppointmentStatus } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { resolveDateRange } from "../common/date-range";

/**
 * Statuses that don't count toward revenue/outstanding (API.md
 * §"today's active"). Deliberately distinct from `BookingService`'s
 * `TERMINAL_STATUSES` — `COMPLETED` is terminal there but still counts as
 * earned revenue here.
 */
const NON_REVENUE_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
]);

/**
 * Counts that describe a period. True for any range.
 */
export interface DashboardTotals {
  countsByStatus: Partial<Record<AppointmentStatus, number>>;
  appointments: number;
  expectedRevenueCents: number;
  outstandingCents: number;
  cancellations: number;
  noShows: number;
}

/**
 * Counts that describe *this moment*. Only meaningful when the range contains
 * today — "3 checked in" over last August is not a fact about anything.
 */
export interface DashboardLive {
  checkedInNow: number;
  inServiceNow: number;
  waitingLate: number;
}

export interface DashboardSummary extends DashboardTotals {
  range: { from: string; to: string };
  /** Null when the range does not include today. */
  live: DashboardLive | null;
}

/** The original today-only shape, kept so existing callers are unaffected. */
export interface DashboardToday extends DashboardTotals, DashboardLive {}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  /**
   * GET /dashboard — totals for a date range, plus live counts when the range
   * covers today.
   *
   * The live block is separated rather than zeroed for a historical range,
   * because zero is a claim: "nobody is in the chair" is true right now and
   * meaningless about last March. A null says the question does not apply.
   */
  async summary(tenantId: string, from?: string, to?: string): Promise<DashboardSummary> {
    const now = new Date();
    // Shared with the reports module so the two can never cover different days.
    const range = resolveDateRange(from, to, now);

    const rows = await this.appointments.find({
      where: { tenantId, appointmentDate: Between(range.from, range.to) },
    });

    return {
      ...tally(rows),
      range: { from: range.from, to: range.to },
      live: range.includesToday ? liveCounts(rows, now, range.today) : null,
    };
  }

  /**
   * GET /dashboard/today — the original endpoint, unchanged in shape.
   * Delegates so there is one implementation of what these numbers mean.
   */
  async today(tenantId: string): Promise<DashboardToday> {
    const summary = await this.summary(tenantId);
    const live = summary.live ?? { checkedInNow: 0, inServiceNow: 0, waitingLate: 0 };
    return {
      countsByStatus: summary.countsByStatus,
      appointments: summary.appointments,
      expectedRevenueCents: summary.expectedRevenueCents,
      outstandingCents: summary.outstandingCents,
      cancellations: summary.cancellations,
      noShows: summary.noShows,
      ...live,
    };
  }
}

function tally(rows: Appointment[]): DashboardTotals {
  const totals: DashboardTotals = {
    countsByStatus: {},
    appointments: rows.length,
    expectedRevenueCents: 0,
    outstandingCents: 0,
    cancellations: 0,
    noShows: 0,
  };

  for (const appointment of rows) {
    totals.countsByStatus[appointment.status] =
      (totals.countsByStatus[appointment.status] ?? 0) + 1;

    if (!NON_REVENUE_STATUSES.has(appointment.status)) {
      totals.expectedRevenueCents += appointment.totalCents;
      totals.outstandingCents += appointment.balanceCents;
    }
    if (appointment.status === AppointmentStatus.CANCELLED) {
      totals.cancellations += 1;
    }
    if (appointment.status === AppointmentStatus.NO_SHOW) {
      totals.noShows += 1;
    }
  }

  return totals;
}

/**
 * "Right now" counts. Scoped to today's rows even when the range is wider —
 * a customer checked in last Tuesday is not standing in the salon.
 */
function liveCounts(rows: Appointment[], now: Date, today: string): DashboardLive {
  const live: DashboardLive = { checkedInNow: 0, inServiceNow: 0, waitingLate: 0 };

  for (const appointment of rows) {
    if (appointment.appointmentDate !== today) {
      continue;
    }
    if (appointment.status === AppointmentStatus.CHECKED_IN) {
      live.checkedInNow += 1;
    }
    if (appointment.status === AppointmentStatus.IN_SERVICE) {
      live.inServiceNow += 1;
    }
    if (appointment.status === AppointmentStatus.CONFIRMED && now > appointment.startTime) {
      live.waitingLate += 1;
    }
  }

  return live;
}

