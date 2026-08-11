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
// TenantService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
import { dayOfWeekOf } from "./time.util";
import { findSlots, type StaffContext } from "./availability.engine";

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

    const [scheduleRows, leaveRows, closureRows] = await Promise.all([
      this.schedules.find({ where: { staffId: In(staffIds), dayOfWeek } }),
      this.leaves.find({ where: { staffId: In(staffIds) } }),
      this.closures.find({ where: { tenantId: tenant.id } }),
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
        // Wired to real Appointment/SlotHold busy intervals in P10 — those
        // tables don't exist yet (ARCHITECTURE.md §4.1 pure engine now,
        // §4.2 transactional reserve in P10). See docs/DECISIONS.md.
        busyIntervals: [],
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
}
