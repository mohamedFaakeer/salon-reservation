import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, Min, ValidateNested } from "class-validator";
import type { PlanTier } from "../tenant-entitlements";

/** Nested inside UpdateTenantEntitlementsDto — whole-replace: omitted key = use the tier default. */
export class ModuleOverridesDto {
  @IsOptional()
  @IsBoolean()
  attendance?: boolean;

  @IsOptional()
  @IsBoolean()
  incentives?: boolean;

  @IsOptional()
  @IsBoolean()
  reports?: boolean;

  @IsOptional()
  @IsBoolean()
  auditLog?: boolean;

  @IsOptional()
  @IsBoolean()
  invoices?: boolean;
}

export class ReportPanelOverridesDto {
  @IsOptional()
  @IsBoolean()
  takings?: boolean;

  @IsOptional()
  @IsBoolean()
  staff?: boolean;

  @IsOptional()
  @IsBoolean()
  services?: boolean;

  @IsOptional()
  @IsBoolean()
  busyHours?: boolean;

  @IsOptional()
  @IsBoolean()
  lapsedCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  customerSpend?: boolean;

  @IsOptional()
  @IsBoolean()
  funnelLosses?: boolean;
}

/** `null` = unlimited/no ceiling; omitted = use the tier default. */
export class LimitOverridesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  maxManagers?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxReceptionists?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxStaff?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxServices?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxIncentivePlans?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBookingsPerDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxBookingWindowDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxReminderOffsets?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountCapPercent?: number | null;
}

/**
 * PATCH /super-admin/tenants/:id/entitlements — SUPER_ADMIN only.
 *
 * Whole-replace semantics for each override bucket, same reasoning as
 * `UpsertIncentivePlanDto`: send only the keys that are actually overridden
 * for this tenant; an omitted key reverts to whatever the tier default says,
 * rather than a partial patch that could leave a stale exception nobody
 * remembers setting.
 */
export class UpdateTenantEntitlementsDto {
  @IsIn(["LITE", "PRO"])
  tier!: PlanTier;

  @IsOptional()
  @ValidateNested()
  @Type(() => ModuleOverridesDto)
  moduleOverrides?: ModuleOverridesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportPanelOverridesDto)
  reportPanelOverrides?: ReportPanelOverridesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverridesDto)
  limitOverrides?: LimitOverridesDto;
}
