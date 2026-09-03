import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { AttendanceDayStatus, ApiError, type BasePayPreviewQueryDto } from "@salon/shared";
import { Employment } from "../entities/employment.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
// AttendanceService must stay a VALUE import for the same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AttendanceService } from "../attendance/attendance.service";
import { datesIn, resolveDateRange } from "../common/date-range";
import { computeBasePay, type BasePayDayInput } from "./base-pay.domain";
import type { BasePayPreviewView } from "./base-pay.types";

@Injectable()
export class BasePayService {
  constructor(
    @InjectRepository(Employment) private readonly employments: Repository<Employment>,
    @InjectRepository(StaffLeave) private readonly leaves: Repository<StaffLeave>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * A live, unsaved base-pay figure for one staff member over a range —
   * nothing here is persisted. Assembled day-by-day from three existing
   * sources of truth rather than re-deriving any of them: `Employment` for
   * what rate/frequency applied on a given date, `AttendanceService.report`
   * for that date's status (the same board/report every other screen reads),
   * and `StaffLeave.paid` for whether an ON_LEAVE date earns pay. The actual
   * business rules live in `computeBasePay` — this method's only job is
   * gathering its inputs.
   */
  async preview(tenantId: string, dto: BasePayPreviewQueryDto): Promise<BasePayPreviewView> {
    const staffRow = await this.staff.findOne({ where: { tenantId, id: dto.staffId } });
    if (!staffRow) {
      throw new ApiError({ statusCode: 404, code: "STAFF_NOT_FOUND", message: "Staff member not found." });
    }

    const range = resolveDateRange(dto.from, dto.to, new Date());

    const [employmentRows, leaveRows, report] = await Promise.all([
      this.employments.find({ where: { tenantId, staffId: dto.staffId } }),
      this.leaves
        .createQueryBuilder("l")
        .where('l."tenantId" = :tenantId', { tenantId })
        .andWhere('l."staffId" = :staffId', { staffId: dto.staffId })
        .andWhere('l."startDate" <= :to AND l."endDate" >= :from', range)
        .getMany(),
      this.attendance.report(tenantId, { from: range.from, to: range.to }, dto.staffId),
    ]);

    const statusByDate = new Map(report.days.map((d) => [d.workDate, d.status]));

    const dayInputs: BasePayDayInput[] = datesIn(range).map((date) => {
      const employment = employmentRows.find((e) => e.effectiveFrom <= date && (e.effectiveTo === null || e.effectiveTo >= date));
      const attendanceStatus = statusByDate.get(date) ?? AttendanceDayStatus.DAY_OFF;
      const covering = leaveRows.filter((l) => l.startDate <= date && date <= l.endDate);

      return {
        date,
        payFrequency: employment?.payFrequency ?? null,
        baseRateCents: employment?.baseRateCents ?? null,
        attendanceStatus,
        leavePaid: attendanceStatus === AttendanceDayStatus.ON_LEAVE ? covering.some((l) => l.paid) : null,
      };
    });

    const result = computeBasePay(dayInputs);
    return { staffId: staffRow.id, staffName: staffRow.name, from: range.from, to: range.to, ...result };
  }
}
