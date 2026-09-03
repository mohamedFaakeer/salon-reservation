import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PayComponentType, PayFrequency, PayrollPaymentMethod } from "../enums";

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

/** One band of the progressive APIT table. `uptoCents: null` means "and above" — must be the last entry. */
export class ApitBandDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  uptoCents!: number | null;

  @IsInt()
  @Min(0)
  @Max(100)
  ratePercent!: number;
}

/**
 * POST /super-admin/statutory-rule-sets — SUPER_ADMIN only (`PLATFORM_ADMIN`).
 *
 * Global, not tenant-scoped — these are facts about Sri Lankan law, not a
 * per-salon policy (StatutoryRuleSet's own doc). `verified` defaults to
 * `false` server-side if omitted; publishing a rule set never itself turns
 * on real calculations for any tenant — that's the separate, per-tenant
 * `Tenant.statutoryPayrollEnabled` gate.
 */
export class UpsertStatutoryRuleSetDto {
  @IsInt()
  @Min(0)
  @Max(100)
  epfEmployeePercent!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  epfEmployerPercent!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  etfEmployerPercent!: number;

  @IsInt()
  @Min(0)
  apitMonthlyFreeThresholdCents!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApitBandDto)
  apitBands!: ApitBandDto[];

  @IsDateString()
  effectiveFrom!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  sourceNote!: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

/** PATCH /super-admin/tenants/:tenantId/statutory-payroll — SUPER_ADMIN only. */
export class UpdateStatutoryPayrollEnabledDto {
  @IsBoolean()
  statutoryPayrollEnabled!: boolean;
}

/**
 * POST /payroll/runs — submits a payroll run for a period, covering every
 * staff member with an employment profile. Idempotent on the money, same
 * shape as `RunIncentivePayoutDto`: an unchanged figure returns the
 * existing run; a moved one voids the old run and submits a fresh one.
 */
export class RunPayrollDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

/** GET /payroll/runs — filters. */
export class PayrollRunQueryDto {
  @IsOptional()
  @IsEnum(["SUBMITTED", "APPROVED", "PAID", "VOID"])
  status?: "SUBMITTED" | "APPROVED" | "PAID" | "VOID";
}

/** PATCH /payroll/runs/:id/void — a manual correction, without resubmitting. */
export class VoidPayrollRunDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/**
 * PATCH /payroll/runs/:id/paid — how the money actually moved. `reference`
 * is a bank batch reference or a free-text cash acknowledgement note,
 * whatever the person marking this paid types — not validated further
 * (spec §15: no digital-signature capture in v1, just a real record
 * instead of none).
 */
export class MarkPayrollRunPaidDto {
  @IsEnum(PayrollPaymentMethod)
  paymentMethod!: PayrollPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}

/**
 * POST /payroll/pay-components/:staffId and PUT /payroll/pay-components/:id
 * — OWNER, MANAGER only (MANAGE_PAYROLL). Recurring by default: once
 * assigned, applies to every payroll run computed while `active`, until
 * changed or deactivated (DECISIONS.md §69) — there is no separate
 * effective-dated version history the way `Employment` has, since an
 * allowance amount changing isn't the same kind of record-worthy event a
 * wage change is; the frozen `PayrollRun.snapshot` is what preserves what
 * was actually applied to a given period regardless.
 */
export class UpsertPayComponentDto {
  @IsEnum(PayComponentType)
  type!: PayComponentType;

  @IsInt()
  @Min(0)
  amountCents!: number;

  /** Whether this component's amount counts toward the EPF-applicable earnings base. Defaults `false` — an unconfirmed legal assumption is never applied silently. */
  @IsOptional()
  @IsBoolean()
  epfApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  etfApplicable?: boolean;

  /** Required when `type` is `OTHER_DEDUCTION` — validated in the service, since it depends on the chosen type. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** GET /payroll/reports — a cost breakdown across every non-void run fully contained in the range. */
export class PayrollReportQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
