import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  type CreateWorkingScheduleDto,
  type UpdateWorkingScheduleDto,
} from "@salon/shared";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { Staff } from "../entities/staff.entity";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

interface ValidatedWindow {
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
}

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(WorkingSchedule)
    private readonly schedules: Repository<WorkingSchedule>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateWorkingScheduleDto,
    actorUserId: string,
  ): Promise<WorkingSchedule> {
    const staffMember = await this.staff.findOne({
      where: { id: dto.staffId, tenantId },
    });
    if (!staffMember) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
        message: "Staff member not found.",
      });
    }

    this.assertValidWindow({
      startMin: dto.startMin,
      endMin: dto.endMin,
      breakStartMin: dto.breakStartMin ?? null,
      breakEndMin: dto.breakEndMin ?? null,
    });

    const existing = await this.schedules.findOne({
      where: { staffId: dto.staffId, dayOfWeek: dto.dayOfWeek },
    });
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: "SCHEDULE_ALREADY_EXISTS",
        message: "A schedule already exists for this staff member on this weekday. PATCH it instead.",
      });
    }

    const saved = await this.schedules.save(
      this.schedules.create({
        tenantId,
        staffId: dto.staffId,
        dayOfWeek: dto.dayOfWeek,
        startMin: dto.startMin,
        endMin: dto.endMin,
        breakStartMin: dto.breakStartMin ?? null,
        breakEndMin: dto.breakEndMin ?? null,
      }),
    );

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "STAFF_SCHEDULE_CHANGED",
      entityType: "WorkingSchedule",
      entityId: saved.id,
      metadata: { staffId: saved.staffId, dayOfWeek: saved.dayOfWeek, change: "created" },
    });

    return saved;
  }

  async list(tenantId: string, staffId?: string): Promise<WorkingSchedule[]> {
    return this.schedules.find({
      where: staffId ? { tenantId, staffId } : { tenantId },
      order: { staffId: "ASC", dayOfWeek: "ASC" },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWorkingScheduleDto,
    actorUserId: string,
  ): Promise<WorkingSchedule> {
    const schedule = await this.findOwned(tenantId, id);

    const next: ValidatedWindow = {
      startMin: dto.startMin ?? schedule.startMin,
      endMin: dto.endMin ?? schedule.endMin,
      breakStartMin: dto.breakStartMin !== undefined ? dto.breakStartMin : schedule.breakStartMin,
      breakEndMin: dto.breakEndMin !== undefined ? dto.breakEndMin : schedule.breakEndMin,
    };
    this.assertValidWindow(next);

    schedule.startMin = next.startMin;
    schedule.endMin = next.endMin;
    schedule.breakStartMin = next.breakStartMin;
    schedule.breakEndMin = next.breakEndMin;

    const saved = await this.schedules.save(schedule);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "STAFF_SCHEDULE_CHANGED",
      entityType: "WorkingSchedule",
      entityId: saved.id,
      metadata: { staffId: saved.staffId, dayOfWeek: saved.dayOfWeek, change: "updated" },
    });

    return saved;
  }

  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    const schedule = await this.findOwned(tenantId, id);
    await this.schedules.remove(schedule);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "STAFF_SCHEDULE_CHANGED",
      entityType: "WorkingSchedule",
      entityId: id,
      metadata: { staffId: schedule.staffId, dayOfWeek: schedule.dayOfWeek, change: "removed" },
    });
  }

  private async findOwned(tenantId: string, id: string): Promise<WorkingSchedule> {
    const schedule = await this.schedules.findOne({ where: { id, tenantId } });
    if (!schedule) {
      throw new ApiError({
        statusCode: 404,
        code: "SCHEDULE_NOT_FOUND",
        message: "Schedule not found.",
      });
    }
    return schedule;
  }

  private assertValidWindow(window: ValidatedWindow): void {
    if (window.startMin >= window.endMin) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_TIME_RANGE",
        message: "endMin must be after startMin.",
      });
    }

    const hasBreakStart = window.breakStartMin !== null;
    const hasBreakEnd = window.breakEndMin !== null;
    if (hasBreakStart !== hasBreakEnd) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_BREAK_WINDOW",
        message: "breakStartMin and breakEndMin must both be set or both be omitted.",
      });
    }
    if (hasBreakStart && hasBreakEnd) {
      const breakStart = window.breakStartMin as number;
      const breakEnd = window.breakEndMin as number;
      if (
        breakStart >= breakEnd ||
        breakStart < window.startMin ||
        breakEnd > window.endMin
      ) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_BREAK_WINDOW",
          message: "The break must fall entirely within the working window.",
        });
      }
    }
  }
}
