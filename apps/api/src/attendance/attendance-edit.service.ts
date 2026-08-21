import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  AttendanceEditRequestStatus,
  UserRole,
  type AttendanceEditRequestQueryDto,
  type CreateAttendanceEditRequestDto,
  type DecideAttendanceEditRequestDto,
} from "@salon/shared";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { AttendanceEditRequest } from "../entities/attendance-edit-request.entity";
import { Staff } from "../entities/staff.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
// TenantService and AuditService must stay VALUE imports for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import type { TenantContextData } from "../tenant/tenant-context";
import { dayOfWeekOf } from "../availability/time.util";
import {
  earlyMinutesFor,
  lateMinutesFor,
  minutesFromMidnightOf,
  workedMinutesBetween,
} from "./attendance.domain";
import type { AttendanceEditRequestView } from "./attendance-edit.types";

/** Roles that may file a request naming somebody other than themselves. */
const ELEVATED_ROLES: string[] = [UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTIONIST];
const DECIDER_ROLES: string[] = [UserRole.OWNER, UserRole.MANAGER];
const UNIQUE_VIOLATION = "23505";

@Injectable()
export class AttendanceEditService {
  constructor(
    @InjectRepository(AttendanceEditRequest) private readonly requests: Repository<AttendanceEditRequest>,
    @InjectRepository(AttendanceDay) private readonly days: Repository<AttendanceDay>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(WorkingSchedule) private readonly schedules: Repository<WorkingSchedule>,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /**
   * File a request.
   *
   * The previous times are captured now, at filing, rather than left to be
   * read off the row when somebody eventually decides — a decision made next
   * week should still show what actually changed, not what has changed
   * since. A day with no existing row files with both previous times null,
   * which is itself the commoner case: a forgotten check-in, not a wrong one.
   */
  async request(
    tenantId: string,
    ctx: TenantContextData,
    dto: CreateAttendanceEditRequestDto,
  ): Promise<AttendanceEditRequestView> {
    if (!dto.requestedCheckInAt && !dto.requestedCheckOutAt) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Request at least one corrected time.",
      });
    }

    const staff = await this.resolveTarget(tenantId, ctx, dto.staffId);
    const existing = await this.days.findOne({ where: { tenantId, staffId: staff.id, workDate: dto.workDate } });

    if (!existing && !dto.requestedCheckInAt) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "There is no check-in recorded for that day yet — request one before requesting a check-out time.",
      });
    }

    const requestedCheckInAt = dto.requestedCheckInAt ? new Date(dto.requestedCheckInAt) : existing?.checkInAt ?? null;
    const requestedCheckOutAt = dto.requestedCheckOutAt
      ? new Date(dto.requestedCheckOutAt)
      : (existing?.checkOutAt ?? null);

    if (requestedCheckOutAt && requestedCheckInAt && requestedCheckOutAt <= requestedCheckInAt) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_TIME_RANGE",
        message: "The corrected check-out must be after the corrected check-in.",
      });
    }

    const row = this.requests.create({
      tenantId,
      staffId: staff.id,
      attendanceId: existing?.id ?? null,
      workDate: dto.workDate,
      previousCheckInAt: existing?.checkInAt ?? null,
      previousCheckOutAt: existing?.checkOutAt ?? null,
      requestedCheckInAt,
      requestedCheckOutAt,
      reason: dto.reason.trim(),
      status: AttendanceEditRequestStatus.PENDING,
      requestedBy: ctx.userId,
    });

    try {
      await this.requests.save(row);
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError({
          statusCode: 409,
          code: "EDIT_REQUEST_ALREADY_PENDING",
          message: `There is already an open correction request for ${staff.name} on ${dto.workDate}.`,
        });
      }
      throw err;
    }

    await this.audit.record({
      tenantId,
      actorUserId: ctx.userId,
      action: "ATTENDANCE_EDIT_REQUESTED",
      entityType: "AttendanceEditRequest",
      entityId: row.id,
      metadata: { staffId: staff.id, workDate: dto.workDate, reason: row.reason },
    });

    return this.viewOf(await this.reload(row.id));
  }

  /** The manager's queue. */
  async list(tenantId: string, query: AttendanceEditRequestQueryDto): Promise<AttendanceEditRequestView[]> {
    const rows = await this.requests.find({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.staffId ? { staffId: query.staffId } : {}),
      },
      relations: { staff: true, requestedByUser: true, decidedByUser: true },
      order: { createdAt: "DESC" },
    });
    return rows.map((r) => this.viewOf(r));
  }

  /** A stylist's own requests. */
  async own(tenantId: string, userId: string): Promise<AttendanceEditRequestView[]> {
    const own = await this.staff.findOne({ where: { tenantId, userId } });
    if (!own) {
      return [];
    }
    return this.list(tenantId, { staffId: own.id });
  }

  /**
   * Approve or reject.
   *
   * Approving writes the corrected times onto the attendance row — creating
   * it first if none existed — and recomputes lateness the same way a live
   * check-in would. The expectation it is judged against is today's rota and
   * grace settings, because the historical ones for that exact day are not
   * separately kept; this is the same limitation the rota itself has
   * everywhere else in the product.
   */
  async decide(
    tenantId: string,
    ctx: TenantContextData,
    id: string,
    dto: DecideAttendanceEditRequestDto,
  ): Promise<AttendanceEditRequestView> {
    if (!ctx.roles.some((r) => DECIDER_ROLES.includes(r))) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "Only an owner or manager can decide a correction request.",
      });
    }

    const row = await this.requests.findOne({ where: { tenantId, id } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Request not found." });
    }
    if (row.status !== AttendanceEditRequestStatus.PENDING) {
      throw new ApiError({
        statusCode: 409,
        code: "EDIT_REQUEST_ALREADY_DECIDED",
        message: "This request has already been decided.",
      });
    }

    if (dto.status === AttendanceEditRequestStatus.APPROVED) {
      await this.apply(tenantId, row);
    }

    row.status = dto.status;
    row.decidedBy = ctx.userId;
    row.decidedAt = new Date();
    row.decisionNote = dto.note?.trim() ?? null;
    await this.requests.save(row);

    await this.audit.record({
      tenantId,
      actorUserId: ctx.userId,
      action: dto.status === AttendanceEditRequestStatus.APPROVED ? "ATTENDANCE_EDIT_APPROVED" : "ATTENDANCE_EDIT_REJECTED",
      entityType: "AttendanceEditRequest",
      entityId: row.id,
      metadata: { staffId: row.staffId, workDate: row.workDate, note: row.decisionNote },
    });

    return this.viewOf(await this.reload(row.id));
  }

  /** Withdrawn by whoever filed it, before anyone decides. */
  async withdraw(tenantId: string, ctx: TenantContextData, id: string): Promise<void> {
    const row = await this.requests.findOne({ where: { tenantId, id } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Request not found." });
    }
    if (row.requestedBy !== ctx.userId && !ctx.roles.some((r) => DECIDER_ROLES.includes(r))) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You can only withdraw a request you filed yourself.",
      });
    }
    if (row.status !== AttendanceEditRequestStatus.PENDING) {
      throw new ApiError({
        statusCode: 409,
        code: "EDIT_REQUEST_ALREADY_DECIDED",
        message: "This request has already been decided.",
      });
    }
    row.status = AttendanceEditRequestStatus.WITHDRAWN;
    await this.requests.save(row);
  }

  private async apply(tenantId: string, row: AttendanceEditRequest): Promise<void> {
    const settings = await this.tenants.getSettings(tenantId);
    const shift = await this.schedules.findOne({
      where: { tenantId, staffId: row.staffId, dayOfWeek: dayOfWeekOf(row.workDate) },
    });

    let day = row.attendanceId ? await this.days.findOne({ where: { id: row.attendanceId } }) : null;
    if (!day) {
      // Only reachable when the request was filed against a day with no
      // existing row, which request() only allows when requestedCheckInAt
      // is present — there is no such thing as a day that starts with a
      // check-out (CHK_attendance_out_after_in requires checkInAt first).
      if (!row.requestedCheckInAt) {
        throw new ApiError({
          statusCode: 409,
          code: "EDIT_REQUEST_MISSING_CHECK_IN",
          message: "Cannot create an attendance day without a check-in time.",
        });
      }
      day = this.days.create({
        tenantId,
        staffId: row.staffId,
        workDate: row.workDate,
        checkInAt: row.requestedCheckInAt,
        expectedStartMin: shift?.startMin ?? null,
        expectedEndMin: shift?.endMin ?? null,
        graceMinutes: settings.attendanceGraceMinutes,
        earlyGraceMinutes: settings.earlyDepartureGraceMinutes,
      });
    }

    if (row.requestedCheckInAt) {
      day.checkInAt = row.requestedCheckInAt;
    }
    if (row.requestedCheckOutAt) {
      day.checkOutAt = row.requestedCheckOutAt;
    }

    const arrivedMin = minutesFromMidnightOf(day.workDate, day.checkInAt);
    day.lateMinutes = lateMinutesFor(day.expectedStartMin, day.graceMinutes, arrivedMin);

    if (day.checkOutAt) {
      const leftMin = minutesFromMidnightOf(day.workDate, day.checkOutAt);
      day.earlyMinutes = earlyMinutesFor(day.expectedEndMin, day.earlyGraceMinutes, leftMin);
      day.workedMinutes = workedMinutesBetween(day.checkInAt, day.checkOutAt);
    }

    const saved = await this.days.save(day);
    row.attendanceId = saved.id;
  }

  private async resolveTarget(
    tenantId: string,
    ctx: TenantContextData,
    requestedStaffId: string | undefined,
  ): Promise<Staff> {
    const own = await this.staff.findOne({ where: { tenantId, userId: ctx.userId } });

    if (!requestedStaffId || (own && requestedStaffId === own.id)) {
      if (!own) {
        throw new ApiError({
          statusCode: 409,
          code: "NO_STAFF_RECORD",
          message: "This login is not linked to a staff member yet.",
        });
      }
      return own;
    }

    if (!ctx.roles.some((r) => ELEVATED_ROLES.includes(r))) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You can only request a correction to your own attendance.",
      });
    }

    const target = await this.staff.findOne({ where: { tenantId, id: requestedStaffId } });
    if (!target) {
      throw new ApiError({ statusCode: 404, code: "STAFF_NOT_FOUND", message: "Staff member not found." });
    }
    return target;
  }

  private async reload(id: string): Promise<AttendanceEditRequest> {
    const row = await this.requests.findOne({
      where: { id },
      relations: { staff: true, requestedByUser: true, decidedByUser: true },
    });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Request not found." });
    }
    return row;
  }

  private viewOf(row: AttendanceEditRequest): AttendanceEditRequestView {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: row.staff?.name ?? "",
      workDate: row.workDate,
      previousCheckInAt: row.previousCheckInAt?.toISOString() ?? null,
      previousCheckOutAt: row.previousCheckOutAt?.toISOString() ?? null,
      requestedCheckInAt: row.requestedCheckInAt?.toISOString() ?? null,
      requestedCheckOutAt: row.requestedCheckOutAt?.toISOString() ?? null,
      reason: row.reason,
      status: row.status,
      requestedByName: row.requestedByUser?.name ?? "",
      decidedByName: row.decidedByUser?.name ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
