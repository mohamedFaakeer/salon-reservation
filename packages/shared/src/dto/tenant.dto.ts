import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
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

  /** Printed on invoices when set. Empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  businessRegNo?: string | null;
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
}
