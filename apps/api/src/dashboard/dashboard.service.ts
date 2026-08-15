import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { AppointmentStatus } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { colomboNow } from "../availability/time.util";

/**
 * Statuses that don't count toward today's revenue/outstanding (API.md
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

export interface DashboardToday {
  countsByStatus: Partial<Record<AppointmentStatus, number>>;
  expectedRevenueCents: number;
  outstandingCents: number;
  checkedInNow: number;
  inServiceNow: number;
  waitingLate: number;
  cancellations: number;
  noShows: number;
}

@Injectable()
export class DashboardService {
  constructor(@InjectRepository(Appointment) private readonly appointments: Repository<Appointment>) {}

  /** GET /dashboard/today — OWNER, MANAGER, RECEPTIONIST. */
  async today(tenantId: string): Promise<DashboardToday> {
    const now = new Date();
    const appointmentDate = colomboNow(now).date;
    const rows = await this.appointments.find({ where: { tenantId, appointmentDate } });

    const result: DashboardToday = {
      countsByStatus: {},
      expectedRevenueCents: 0,
      outstandingCents: 0,
      checkedInNow: 0,
      inServiceNow: 0,
      waitingLate: 0,
      cancellations: 0,
      noShows: 0,
    };

    for (const appointment of rows) {
      result.countsByStatus[appointment.status] = (result.countsByStatus[appointment.status] ?? 0) + 1;

      if (!NON_REVENUE_STATUSES.has(appointment.status)) {
        result.expectedRevenueCents += appointment.totalCents;
        result.outstandingCents += appointment.balanceCents;
      }
      if (appointment.status === AppointmentStatus.CHECKED_IN) {
        result.checkedInNow += 1;
      }
      if (appointment.status === AppointmentStatus.IN_SERVICE) {
        result.inServiceNow += 1;
      }
      if (appointment.status === AppointmentStatus.CONFIRMED && now > appointment.startTime) {
        result.waitingLate += 1;
      }
      if (appointment.status === AppointmentStatus.CANCELLED) {
        result.cancellations += 1;
      }
      if (appointment.status === AppointmentStatus.NO_SHOW) {
        result.noShows += 1;
      }
    }

    return result;
  }
}
