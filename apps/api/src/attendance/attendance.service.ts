import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IsNull, Repository } from "typeorm";
import { ApiError, AttendanceDayStatus, UserRole, type AttendanceQueryDto } from "@salon/shared";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { Closure } from "../entities/closure.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
// TenantService and AuditService must stay VALUE imports for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import type { TenantContextData } from "../tenant/tenant-context";
import { colomboNow, dayOfWeekOf } from "../availability/time.util";
import { datesIn, resolveDateRange } from "../common/date-range";
import {
  dayIsOver,
  earlyMinutesFor,
  lateMinutesFor,
  minutesFromMidnightOf,
  resolveStatus,
  workDateOf,
  workedMinutesBetween,
} from "./attendance.domain";
import type {
  AttendanceDayView,
  AttendanceReport,
  AttendanceStaffSummary,
} from "./attendance.types";

/** Roles that may punch somebody other than themselves. */
const ELEVATED_ROLES: string[] = [UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTIONIST];

/**
 * How long a check-in may stay open before checking out is no longer the
 * right tool.
 *
 * Long enough for a genuine past-midnight finish — a bridal party that ran to
 * one in the morning still belongs to the day it started. Short enough that
 * yesterday's forgotten punch cannot be closed with today's clock, which
 * would silently record a twenty-hour shift. Past this, the correction flow
 * is the only way, and somebody has to say when they actually left.
 */
const MAX_OPEN_SHIFT_HOURS = 18;

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceDay) private readonly days: Repository<AttendanceDay>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(WorkingSchedule) private readonly schedules: Repository<WorkingSchedule>,
    @InjectRepository(StaffLeave) private readonly leave: Repository<StaffLeave>,
    @InjectRepository(Closure) private readonly closures: Repository<Closure>,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Arriving.
   *
   * The time is the server's, never the client's — a punch means *now*,
   * whoever pressed it. The rostered shift and the salon's grace settings are
   * copied onto the row here rather than looked up later, so that editing a
   * rota next season cannot rewrite whether somebody was late today.
   */
  async checkIn(
    tenantId: string,
    ctx: TenantContextData,
    requestedStaffId: string | undefined,
  ): Promise<AttendanceDayView> {
    const now = new Date();
    const staff = await this.resolveTarget(tenantId, ctx, requestedStaffId);
    const workDate = workDateOf(now);
    const settings = await this.tenants.getSettings(tenantId);
    const shift = await this.schedules.findOne({
      where: { tenantId, staffId: staff.id, dayOfWeek: dayOfWeekOf(workDate) },
    });

    const expectedStartMin = shift?.startMin ?? null;
    const arrivedMin = minutesFromMidnightOf(workDate, now);

    const row = this.days.create({
      tenantId,
      staffId: staff.id,
      workDate,
      checkInAt: now,
      checkInBy: ctx.userId,
      expectedStartMin,
      expectedEndMin: shift?.endMin ?? null,
      graceMinutes: settings.attendanceGraceMinutes,
      earlyGraceMinutes: settings.earlyDepartureGraceMinutes,
      lateMinutes: lateMinutesFor(expectedStartMin, settings.attendanceGraceMinutes, arrivedMin),
      earlyMinutes: 0,
      workedMinutes: null,
    });

    try {
      await this.days.insert(row);
    } catch (err) {
      // The unique index decides, not a check-then-insert: two taps on a slow
      // connection, or the desk punching in somebody who already punched
      // themselves in, collide here rather than producing two shifts.
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError({
          statusCode: 409,
          code: "ALREADY_CHECKED_IN",
          message: `${staff.name} is already checked in for today.`,
        });
      }
      throw err;
    }

    await this.auditOnBehalf(tenantId, ctx, staff, row, "ATTENDANCE_CHECK_IN");
    return this.viewOf(staff, workDate, row, {
      onLeave: false,
      closed: false,
      rostered: expectedStartMin !== null,
      now,
    });
  }

  /**
   * Leaving.
   *
   * Closes the most recent open check-in rather than strictly today's, so a
   * shift that ran past midnight closes against the day it started. Anything
   * older than MAX_OPEN_SHIFT_HOURS is a forgotten punch, not a long night,
   * and is refused with a pointer at the correction flow — closing it with
   * the current clock would invent a shift nobody worked.
   */
  async checkOut(
    tenantId: string,
    ctx: TenantContextData,
    requestedStaffId: string | undefined,
  ): Promise<AttendanceDayView> {
    const now = new Date();
    const staff = await this.resolveTarget(tenantId, ctx, requestedStaffId);

    const open = await this.days.findOne({
      where: { tenantId, staffId: staff.id, checkOutAt: IsNull() },
      order: { workDate: "DESC" },
    });

    if (!open) {
      throw new ApiError({
        statusCode: 409,
        code: "NOT_CHECKED_IN",
        message: `${staff.name} has no open check-in to close. Check in first, or request a correction if the check-in was missed.`,
      });
    }

    const openHours = (now.getTime() - open.checkInAt.getTime()) / 3_600_000;
    if (openHours > MAX_OPEN_SHIFT_HOURS) {
      throw new ApiError({
        statusCode: 409,
        code: "STALE_CHECK_IN",
        message: `The check-in from ${open.workDate} was never closed. Request a correction with the time ${staff.name} actually left — checking out now would record a shift of more than ${MAX_OPEN_SHIFT_HOURS} hours.`,
      });
    }

    const leftMin = minutesFromMidnightOf(open.workDate, now);
    open.checkOutAt = now;
    open.checkOutBy = ctx.userId;
    open.earlyMinutes = earlyMinutesFor(open.expectedEndMin, open.earlyGraceMinutes, leftMin);
    open.workedMinutes = workedMinutesBetween(open.checkInAt, now);
    await this.days.save(open);

    await this.auditOnBehalf(tenantId, ctx, staff, open, "ATTENDANCE_CHECK_OUT");
    return this.viewOf(staff, open.workDate, open, {
      onLeave: false,
      closed: false,
      rostered: open.expectedStartMin !== null,
      now,
    });
  }

  /** Everyone, for one day — the board the front desk works from. */
  async board(
    tenantId: string,
    date: string | undefined,
  ): Promise<{ date: string; rows: AttendanceDayView[] }> {
    const now = new Date();
    const target = date ?? colomboNow(now).date;
    const report = await this.buildReport(tenantId, { from: target, to: target }, undefined, now);
    return { date: target, rows: report.days };
  }

  /** A range, for one person or everyone. */
  async report(
    tenantId: string,
    query: AttendanceQueryDto,
    staffIdOverride?: string,
  ): Promise<AttendanceReport> {
    const now = new Date();
    const range = resolveDateRange(query.from, query.to, now);
    return this.buildReport(tenantId, range, staffIdOverride ?? query.staffId, now);
  }

  /** The staff row behind a login, for the "me" routes. */
  async ownStaffId(tenantId: string, userId: string): Promise<string> {
    const own = await this.staff.findOne({ where: { tenantId, userId } });
    if (!own) {
      throw new ApiError({
        statusCode: 409,
        code: "NO_STAFF_RECORD",
        message:
          "This login is not linked to a staff member yet. Ask the salon owner to link it before recording attendance.",
      });
    }
    return own.id;
  }

  private async buildReport(
    tenantId: string,
    range: { from: string; to: string },
    staffId: string | undefined,
    now: Date,
  ): Promise<AttendanceReport> {
    const dates = datesIn(range);

    const [staffRows, schedules, leaves, closures, recorded] = await Promise.all([
      this.staff.find({
        where: staffId ? { tenantId, id: staffId } : { tenantId },
        order: { name: "ASC" },
      }),
      this.schedules.find({ where: staffId ? { tenantId, staffId } : { tenantId } }),
      this.leave
        .createQueryBuilder("l")
        .where('l."tenantId" = :tenantId', { tenantId })
        .andWhere('l."startDate" <= :to AND l."endDate" >= :from', range)
        .andWhere(staffId ? 'l."staffId" = :staffId' : "1=1", { staffId })
        .getMany(),
      this.closures
        .createQueryBuilder("c")
        .where('c."tenantId" = :tenantId', { tenantId })
        .andWhere('c."startDate" <= :to AND c."endDate" >= :from', range)
        .getMany(),
      this.days
        .createQueryBuilder("d")
        .leftJoinAndSelect("d.checkInByUser", "inUser")
        .leftJoinAndSelect("d.checkOutByUser", "outUser")
        .where('d."tenantId" = :tenantId', { tenantId })
        .andWhere('d."workDate" BETWEEN :from AND :to', range)
        .andWhere(staffId ? 'd."staffId" = :staffId' : "1=1", { staffId })
        .getMany(),
    ]);

    // Inactive staff are dropped from a single day's board but kept in
    // history: somebody who left in March still worked in February, and a
    // report that quietly omitted them would not add up against the payroll
    // of the time.
    const people = staffRows.filter(
      (s) => s.active || recorded.some((r) => r.staffId === s.id),
    );

    const shiftFor = new Map<string, WorkingSchedule>();
    for (const s of schedules) {
      shiftFor.set(`${s.staffId}:${s.dayOfWeek}`, s);
    }
    const rowFor = new Map<string, AttendanceDay>();
    for (const r of recorded) {
      rowFor.set(`${r.staffId}:${r.workDate}`, r);
    }
    const closedDates = new Set<string>();
    for (const date of dates) {
      if (closures.some((c) => c.startDate <= date && date <= c.endDate)) {
        closedDates.add(date);
      }
    }

    const days: AttendanceDayView[] = [];
    for (const person of people) {
      for (const date of dates) {
        const shift = shiftFor.get(`${person.id}:${dayOfWeekOf(date)}`);
        const row = rowFor.get(`${person.id}:${date}`) ?? null;
        const onLeave = leaves.some(
          (l) => l.staffId === person.id && l.startDate <= date && date <= l.endDate,
        );
        days.push(
          this.viewOf(person, date, row, {
            onLeave,
            closed: closedDates.has(date),
            rostered: shift !== undefined,
            expectedStartMin: shift?.startMin ?? null,
            expectedEndMin: shift?.endMin ?? null,
            now,
          }),
        );
      }
    }

    return {
      range: { ...range, days: dates.length },
      summary: summarise(people, days),
      days,
    };
  }

  /**
   * The one place a day becomes a verdict.
   *
   * A recorded row carries its own snapshotted expectation and is trusted
   * over today's rota; a day with no row falls back to what the rota says
   * now, because there is nothing else to go on and nothing was measured.
   */
  private viewOf(
    staff: Staff,
    workDate: string,
    row: AttendanceDay | null,
    context: {
      onLeave: boolean;
      closed: boolean;
      rostered: boolean;
      expectedStartMin?: number | null;
      expectedEndMin?: number | null;
      now: Date;
    },
  ): AttendanceDayView {
    const expectedStartMin = row ? row.expectedStartMin : (context.expectedStartMin ?? null);
    const expectedEndMin = row ? row.expectedEndMin : (context.expectedEndMin ?? null);
    const over = dayIsOver(workDate, expectedEndMin, context.now);

    const status = resolveStatus({
      hasCheckIn: row !== null,
      hasCheckOut: row?.checkOutAt != null,
      rostered: row ? row.expectedStartMin !== null : context.rostered,
      onLeave: context.onLeave,
      closed: context.closed,
      dayIsOver: over,
    });

    const recordedBy = row?.checkOutByUser ?? row?.checkInByUser ?? null;

    return {
      id: row?.id ?? null,
      staffId: staff.id,
      staffName: staff.name,
      workDate,
      status,
      checkInAt: row?.checkInAt.toISOString() ?? null,
      checkOutAt: row?.checkOutAt?.toISOString() ?? null,
      expectedStartMin,
      expectedEndMin,
      lateMinutes: row?.lateMinutes ?? 0,
      earlyMinutes: row?.earlyMinutes ?? 0,
      workedMinutes: row?.workedMinutes ?? null,
      selfRecorded: row !== null && staff.userId !== null && row.checkInBy === staff.userId,
      recordedByName: recordedBy?.name ?? null,
    };
  }

  /**
   * Which staff member this punch is for.
   *
   * No `staffId` means "me". Naming somebody else is the front-desk path and
   * needs an elevated role — a stylist must not be able to punch in a
   * colleague who has not arrived.
   */
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
          message:
            "This login is not linked to a staff member yet, so there is nobody to check in. Ask the salon owner to link it, or check in the stylist by name.",
        });
      }
      this.assertActive(own);
      return own;
    }

    if (!ctx.roles.some((r) => ELEVATED_ROLES.includes(r))) {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You can only record your own attendance.",
      });
    }

    const target = await this.staff.findOne({ where: { tenantId, id: requestedStaffId } });
    if (!target) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
        message: "Staff member not found.",
      });
    }
    this.assertActive(target);
    return target;
  }

  private assertActive(staff: Staff): void {
    if (!staff.active) {
      throw new ApiError({
        statusCode: 409,
        code: "STAFF_INACTIVE",
        message: `${staff.name} is no longer active at this salon.`,
      });
    }
  }

  /**
   * Only punches made on somebody else's behalf are audited.
   *
   * A self-punch is already fully attributed by `checkInBy`, and writing an
   * audit row for every arrival and departure would bury the entries that
   * carry a question — twenty stylists twice a day is fifteen thousand rows a
   * year of "she said she was here, and she was". A punch made *for* someone
   * is the one somebody may later dispute.
   */
  private async auditOnBehalf(
    tenantId: string,
    ctx: TenantContextData,
    staff: Staff,
    row: AttendanceDay,
    action: string,
  ): Promise<void> {
    if (staff.userId === ctx.userId) {
      return;
    }
    await this.audit.record({
      tenantId,
      actorUserId: ctx.userId,
      action,
      entityType: "AttendanceDay",
      entityId: row.id,
      metadata: {
        staffId: staff.id,
        staffName: staff.name,
        workDate: row.workDate,
        onBehalf: true,
      },
    });
  }
}

/** Range totals per person, from the same day views the screen shows. */
function summarise(people: Staff[], days: AttendanceDayView[]): AttendanceStaffSummary[] {
  return people.map((person) => {
    const mine = days.filter((d) => d.staffId === person.id);
    const summary: AttendanceStaffSummary = {
      staffId: person.id,
      staffName: person.name,
      presentDays: 0,
      lateDays: 0,
      lateMinutes: 0,
      earlyDays: 0,
      earlyMinutes: 0,
      absentDays: 0,
      missingCheckOutDays: 0,
      leaveDays: 0,
      workedMinutes: 0,
      rosteredDays: 0,
    };

    for (const day of mine) {
      if (day.expectedStartMin !== null) {
        summary.rosteredDays += 1;
      }
      if (day.lateMinutes > 0) {
        summary.lateDays += 1;
        summary.lateMinutes += day.lateMinutes;
      }
      if (day.earlyMinutes > 0) {
        summary.earlyDays += 1;
        summary.earlyMinutes += day.earlyMinutes;
      }
      summary.workedMinutes += day.workedMinutes ?? 0;

      switch (day.status) {
        case AttendanceDayStatus.PRESENT:
          summary.presentDays += 1;
          break;
        case AttendanceDayStatus.MISSING_CHECK_OUT:
          summary.presentDays += 1;
          summary.missingCheckOutDays += 1;
          break;
        case AttendanceDayStatus.ABSENT:
          summary.absentDays += 1;
          break;
        case AttendanceDayStatus.ON_LEAVE:
          summary.leaveDays += 1;
          break;
        default:
          break;
      }
    }

    return summary;
  });
}
