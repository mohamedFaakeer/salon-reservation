import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, Repository } from "typeorm";
import { ApiError, type AvailabilityQueryDto } from "@salon/shared";
import { Staff } from "../entities/staff.entity";
import { StaffServiceAssignment } from "../entities/staff-service.entity";
import { Service } from "../entities/service.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Closure } from "../entities/closure.entity";
import { Appointment } from "../entities/appointment.entity";
import { SlotHold } from "../entities/slot-hold.entity";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  ACTIVE_SLOT_HOLD_STATUS,
} from "../appointment/appointment-status.constants";
// TenantService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
import { colomboNow, dayOfWeekOf } from "./time.util";
import { findSlots, type BusyInterval, type StaffContext } from "./availability.engine";

export interface AvailabilitySlot {
  staffId: string;
  staffName: string;
  start: string;
  end: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(StaffServiceAssignment)
    private readonly assignments: Repository<StaffServiceAssignment>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(WorkingSchedule)
    private readonly schedules: Repository<WorkingSchedule>,
    @InjectRepository(StaffLeave) private readonly leaves: Repository<StaffLeave>,
    @InjectRepository(Closure) private readonly closures: Repository<Closure>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(SlotHold) private readonly slotHolds: Repository<SlotHold>,
    private readonly tenantService: TenantService,
  ) {}

  async findSlots(slug: string, dto: AvailabilityQueryDto): Promise<{ slots: AvailabilitySlot[] }> {
    const tenant = await this.tenantService.findActiveBySlug(slug);

    const requestedServiceIds = new Set(dto.serviceIds);
    const services = await this.services.find({
      where: { id: In(dto.serviceIds), tenantId: tenant.id, active: true },
    });
    if (services.length !== requestedServiceIds.size) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
        message: "One or more requested services do not exist.",
      });
    }
    const durationMin = services.reduce((sum, s) => sum + s.durationMin, 0);

    const qualifiedStaff = await this.resolveQualifiedStaff(tenant.id, dto);
    if (qualifiedStaff.length === 0) {
      return { slots: [] };
    }

    const dayOfWeek = dayOfWeekOf(dto.date);
    const staffIds = qualifiedStaff.map((s) => s.id);

    const [scheduleRows, leaveRows, closureRows, busyByStaff] = await Promise.all([
      this.schedules.find({ where: { staffId: In(staffIds), dayOfWeek } }),
      this.leaves.find({ where: { staffId: In(staffIds) } }),
      this.closures.find({ where: { tenantId: tenant.id } }),
      this.loadBusyIntervals(tenant.id, staffIds, dto.date),
    ]);
    const scheduleByStaff = new Map(scheduleRows.map((r) => [r.staffId, r]));
    const salonClosed = closureRows.some((c) => c.startDate <= dto.date && dto.date <= c.endDate);

    const staffContexts: StaffContext[] = qualifiedStaff.map((s) => {
      const schedule = scheduleByStaff.get(s.id);
      const onLeave = leaveRows.some(
        (l) => l.staffId === s.id && l.startDate <= dto.date && dto.date <= l.endDate,
      );
      return {
        staffId: s.id,
        staffName: s.name,
        schedule: schedule
          ? {
              startMin: schedule.startMin,
              endMin: schedule.endMin,
              breakStartMin: schedule.breakStartMin,
              breakEndMin: schedule.breakEndMin,
            }
          : null,
        onLeave,
        busyIntervals: busyByStaff.get(s.id) ?? [],
      };
    });

    const candidates = findSlots({
      date: dto.date,
      durationMin,
      staff: staffContexts,
      salonClosed,
      now: new Date(),
      sameDayLeadMinutes: tenant.settings.sameDayLeadMinutes,
      bookingWindowDays: tenant.settings.bookingWindowDays,
    });

    return {
      slots: candidates.map((c) => ({
        staffId: c.staffId,
        staffName: c.staffName,
        start: c.start.toISOString(),
        end: c.end.toISOString(),
      })),
    };
  }

  private async resolveQualifiedStaff(tenantId: string, dto: AvailabilityQueryDto): Promise<Staff[]> {
    if (dto.staffId) {
      const one = await this.staff.findOne({
        where: { id: dto.staffId, tenantId, active: true },
      });
      if (!one) {
        throw new ApiError({
          statusCode: 404,
          code: "STAFF_NOT_FOUND",
          message: "Staff member not found.",
        });
      }
      const qualifiedIds = await this.qualifiedStaffIds(tenantId, dto.serviceIds);
      return qualifiedIds.has(one.id) ? [one] : [];
    }

    const active = await this.staff.find({ where: { tenantId, active: true } });
    const qualifiedIds = await this.qualifiedStaffIds(tenantId, dto.serviceIds);
    return active.filter((s) => qualifiedIds.has(s.id));
  }

  /** Staff qualify only if they have a StaffServiceAssignment for every requested service. */
  private async qualifiedStaffIds(tenantId: string, serviceIds: string[]): Promise<Set<string>> {
    const required = new Set(serviceIds).size;
    const rows = await this.assignments.find({
      where: { tenantId, serviceId: In(serviceIds) },
    });

    const byStaff = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = byStaff.get(row.staffId) ?? new Set<string>();
      set.add(row.serviceId);
      byStaff.set(row.staffId, set);
    }

    const qualified = new Set<string>();
    for (const [staffId, coveredServiceIds] of byStaff) {
      if (coveredServiceIds.size === required) {
        qualified.add(staffId);
      }
    }
    return qualified;
  }

  /**
   * Single-staff context for `BookingService.reserve`/`confirmHold`'s
   * `canBook` re-validation — reuses the exact same schedule/leave/busy
   * data sources as `findSlots`, just scoped to one staff member instead of
   * looping the whole tenant. One data source, never duplicated.
   */
  async loadStaffContext(tenantId: string, staffId: string, date: string): Promise<StaffContext> {
    const staffRow = await this.staff.findOne({ where: { id: staffId, tenantId, active: true } });
    if (!staffRow) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
        message: "Staff member not found.",
      });
    }

    const dayOfWeek = dayOfWeekOf(date);
    const [scheduleRow, leaveRows, busyByStaff] = await Promise.all([
      this.schedules.findOne({ where: { staffId, dayOfWeek } }),
      this.leaves.find({ where: { staffId } }),
      this.loadBusyIntervals(tenantId, [staffId], date),
    ]);
    const onLeave = leaveRows.some((l) => l.startDate <= date && date <= l.endDate);

    return {
      staffId: staffRow.id,
      staffName: staffRow.name,
      schedule: scheduleRow
        ? {
            startMin: scheduleRow.startMin,
            endMin: scheduleRow.endMin,
            breakStartMin: scheduleRow.breakStartMin,
            breakEndMin: scheduleRow.breakEndMin,
          }
        : null,
      onLeave,
      busyIntervals: busyByStaff.get(staffId) ?? [],
    };
  }

  async isSalonClosed(tenantId: string, date: string): Promise<boolean> {
    const closureRows = await this.closures.find({ where: { tenantId } });
    return closureRows.some((c) => c.startDate <= date && date <= c.endDate);
  }

  async isQualified(tenantId: string, staffId: string, serviceIds: string[]): Promise<boolean> {
    const qualifiedIds = await this.qualifiedStaffIds(tenantId, serviceIds);
    return qualifiedIds.has(staffId);
  }

  /**
   * Busy intervals from real `Appointment` (active statuses) + `SlotHold`
   * (HELD, not yet expired) rows, keyed by staffId, in local minutes for the
   * given date. Public so `BookingService` can reuse it for the same
   * single-staff `canBook` re-validation inside `reserve`/`confirmHold` — one
   * engine, one data source, never duplicated (CLAUDE.md rule 1/2).
   *
   * A `SlotHold` past its `expiresAt` is treated as not-busy here (read-only
   * display concern); `BookingService.reserve` additionally does a lazy
   * `UPDATE ... SET status='EXPIRED'` sweep before inserting, so the DB
   * exclusion constraint — which only reads `status`, not `expiresAt` — is
   * accurate at write time too (see DECISIONS.md).
   */
  async loadBusyIntervals(
    tenantId: string,
    staffIds: string[],
    date: string,
  ): Promise<Map<string, BusyInterval[]>> {
    const map = new Map<string, BusyInterval[]>();
    if (staffIds.length === 0) {
      return map;
    }

    const now = new Date();
    const [appointmentRows, holdRows] = await Promise.all([
      this.appointments.find({
        where: {
          tenantId,
          staffId: In(staffIds),
          appointmentDate: date,
          status: In(ACTIVE_APPOINTMENT_STATUSES),
        },
      }),
      this.slotHolds.find({
        where: { tenantId, staffId: In(staffIds), status: ACTIVE_SLOT_HOLD_STATUS },
      }),
    ]);

    const add = (staffId: string, start: Date, end: Date): void => {
      const startMin = colomboNow(start).minutes;
      const endMin = startMin + (end.getTime() - start.getTime()) / 60_000;
      const list = map.get(staffId) ?? [];
      list.push({ startMin, endMin });
      map.set(staffId, list);
    };

    for (const appointment of appointmentRows) {
      add(appointment.staffId, appointment.startTime, appointment.endTime);
    }
    for (const hold of holdRows) {
      if (hold.expiresAt > now && colomboNow(hold.startTime).date === date) {
        add(hold.staffId, hold.startTime, hold.endTime);
      }
    }

    return map;
  }
}
