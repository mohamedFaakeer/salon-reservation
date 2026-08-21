import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
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

/**
 * One service's own rate, overriding the plan's base commission for it —
 * "5% on a cut, 15% on colouring" rather than one number for everything a
 * stylist does.
 */
export class IncentivePlanServiceRateDto {
  @IsUUID("4")
  serviceId!: string;

  /** Whole percent, 0-100. Replaces the base rate entirely for this service. */
  @IsInt()
  @Min(0)
  @Max(100)
  ratePercent!: number;
}

/**
 * PUT /incentive-plans/:id and POST /incentive-plans — OWNER, MANAGER only.
 *
 * All three components are optional, but at least one must be set (checked
 * server-side, matching `CHK_incentive_plan_has_component`): a plan that pays
 * nothing is a configuration mistake, not a valid state. They compose freely
 * — a stylist can earn a base commission, a richer rate on two named
 * services, and a bonus once they clear a monthly figure, all from one plan.
 */
export class UpsertIncentivePlanDto {
  /** e.g. "Senior stylist commission" — how an owner tells plans apart when assigning one. */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  baseCommissionPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  perJobAmountCents?: number;

  /** Both or neither — a target with no bonus rate does nothing, and vice versa. */
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTargetCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  tierBonusPercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => IncentivePlanServiceRateDto)
  serviceRates?: IncentivePlanServiceRateDto[];
}

/** GET /incentive-plans/preview — a live, unsaved figure for one range. */
export class IncentivePreviewQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID("4")
  staffId?: string;
}

/**
 * POST /incentive-payouts — finalise one staff member's figure for a period.
 *
 * Idempotent on the money the same way an invoice is: running it twice with
 * nothing changed returns the existing payout rather than a near-identical
 * duplicate. A changed figure supersedes — the old row is voided and a new
 * one takes its place, never edited in place.
 */
export class RunIncentivePayoutDto {
  @IsUUID("4")
  staffId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

/** GET /incentive-payouts — filters. */
export class IncentivePayoutQueryDto {
  @IsOptional()
  @IsUUID("4")
  staffId?: string;

  @IsOptional()
  @IsIn(["FINALISED", "PAID", "VOID"])
  status?: "FINALISED" | "PAID" | "VOID";
}

/** PATCH /incentive-payouts/:id/void — a manual correction, without reissuing. */
export class VoidIncentivePayoutDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
