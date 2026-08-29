import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { AdvanceRule } from "../enums";
import type { PlanTier } from "../tenant-entitlements";

/** POST /super-admin/tenants (API.md §4) — SUPER_ADMIN only. */
export class ProvisionTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  salonName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug must be lowercase alphanumeric with hyphens",
  })
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsEmail()
  @MaxLength(255)
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  ownerPassword!: string;

  /** Defaults to PRO server-side when omitted; the provisioning form always sends an explicit choice. */
  @IsOptional()
  @IsIn(["LITE", "PRO"])
  tier?: PlanTier;
}

/**
 * PATCH /super-admin/tenants/:tenantId/customer-visibility — SUPER_ADMIN only.
 * Deliberately its own single-field DTO, not folded into entitlements: this
 * is an operational on/off switch a platform admin flips directly, not a
 * plan/tier setting.
 */
export class UpdateTenantVisibilityDto {
  @IsBoolean()
  customerBookingEnabled!: boolean;
}

/**
 * POST /super-admin/tenants/:tenantId/deactivate — SUPER_ADMIN only.
 * `reason` is optional free text kept only for the audit trail (why this
 * salon was offboarded); it never gates the action itself.
 */
export class DeactivateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Nested inside TenantSettingsUpdateDto; all fields optional (PATCH semantics). */
export class CancellationPolicyUpdateDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2160)
  selfServiceCutoffHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentBeforeCutoff?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentAfterCutoff?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  noShowRefundPercent?: number;
}

/** PATCH /tenant/me/settings — API.md §3. All fields optional (PATCH semantics). */
export class TenantSettingsUpdateDto {
  @IsOptional()
  @IsEnum(AdvanceRule)
  advanceRule?: AdvanceRule;

  @IsOptional()
  @IsInt()
  @Min(0)
  advanceValueCents?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  advancePercent?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CancellationPolicyUpdateDto)
  cancellationPolicy?: CancellationPolicyUpdateDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingWindowDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  sameDayLeadMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  noShowGraceMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(720, { each: true })
  reminderOffsets?: number[];

  /**
   * Whole percent, 0-100. How much of a bill anyone who can take payment may
   * give away unaided; above it, an owner or manager must apply the discount.
   * Zero means nobody discounts without that authority.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountCapPercent?: number;

  /**
   * Minutes of latitude on each end of a rostered shift before an arrival
   * counts as late or a departure as early. Capped at four hours: anything
   * beyond that is not a grace period, it is a different shift.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  attendanceGraceMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  earlyDepartureGraceMinutes?: number;

  /** Printed on invoices when set. Empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  businessRegNo?: string | null;

  /** Notification bell settings tab — the popup only, never the badge/drawer. */
  @IsOptional()
  @IsBoolean()
  staffNotificationPopupsEnabled?: boolean;
}

/** PATCH /tenant/me — name only; slug/currency/timezone are not editable here. */
export class TenantProfileUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
}

/** PATCH /tenant/me/branch — the single default branch (MVP is single-branch-per-tenant). */
export class BranchUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /**
   * Powers the "Get Directions" link on the customer site — set together,
   * `null` clears both. Range-checked here (real business rule: a
   * coordinate outside these bounds cannot exist); how a pasted Google
   * Maps link becomes these two numbers is a pure input-format convenience
   * handled client-side, not a business rule this server needs to know.
   */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
