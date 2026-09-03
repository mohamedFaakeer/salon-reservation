import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { PayFrequency } from "../enums";

/**
 * POST /payroll/employment/:staffId and POST /payroll/employment/:staffId/change
 * — OWNER, MANAGER only (MANAGE_PAYROLL).
 *
 * Both routes take the same shape: creating the first version and superseding
 * an existing one are the same fact ("this is how this person is paid, as of
 * this date"), just with a different starting condition server-side (see
 * EmploymentService). EPF/ETF eligibility, bank details, and everything else
 * the full spec eventually needs are deliberately not here yet — they have no
 * consumer until the statutory engine (Phase 4) and payments (Phase 5) exist,
 * and adding them then is a new version, not a retrofit of this one.
 */
export class UpsertEmploymentDto {
  @IsEnum(PayFrequency)
  payFrequency!: PayFrequency;

  /** Monthly salary if `payFrequency` is MONTHLY, daily wage if DAILY. */
  @IsInt()
  @Min(0)
  baseRateCents!: number;

  /** The date this version takes effect. Same-day or future; never before the currently open version started. */
  @IsDateString()
  effectiveFrom!: string;
}

/**
 * PUT /payroll/pay-calendars/monthly — OWNER, MANAGER only (MANAGE_PAYROLL).
 *
 * Daily pay periods need no configuration (a day is a day); only the monthly
 * cycle's start-of-month day is ever tenant-specific, so there is exactly one
 * settable field here rather than a generic "calendar" object.
 */
export class UpsertPayCalendarDto {
  /** Day of the month a pay period starts, e.g. 1 for a calendar month, 21 for a 21st-to-20th cycle. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  monthlyAnchorDay?: number;
}

/**
 * GET /payroll/base-pay/preview — a live, unsaved base-pay figure for one
 * staff member over a range, built from their real Employment/Attendance/
 * StaffLeave records. Nothing here is persisted — the same "preview, not a
 * run" shape `IncentivePreviewQueryDto` already uses.
 */
export class BasePayPreviewQueryDto {
  @IsUUID("4")
  staffId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
