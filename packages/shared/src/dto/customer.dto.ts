import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { CustomerSegment, Province } from "../enums";
import { PaginationQueryDto } from "./common.dto";

/** POST /customers (API.md §3) and the inline `customer` object on bookings. */
export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  /** Built-in (Mr./Mrs./Ms./Dr.) or a tenant-custom value from `TenantSettings.customTitleOptions` — resolved plain text, no enum. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  /** Built-in (walk-in/web app/referral) or a tenant-custom value from `TenantSettings.customClientSourceOptions` — resolved plain text, no enum. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  clientSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Every id must belong to this tenant's own tag set — validated server-side, never trusted from the client. */
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];
}

/** GET /customers?q=&segment=&tagId= — search/filter. */
export class CustomerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @IsOptional()
  @IsUUID()
  tagId?: string;
}

/** GET /customers/lookup?phone= — powers the Add/Edit drawer's live duplicate check. */
export class CustomerPhoneLookupQueryDto {
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone!: string;
}

/**
 * PATCH /customers/:id (API.md §3) — a real general edit. Every field
 * optional (PATCH semantics); `phone`/`email` changes re-run the same
 * duplicate check `create` does, excluding this customer's own row.
 */
export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  marketingOptOut?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string | null;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  clientSource?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsEnum(Province)
  province?: Province | null;

  /** Replaces the full tag set when present — matches checkbox-form semantics (same convention as StaffService.setServices). */
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds?: string[];
}

/** POST /tags — OWNER/MANAGER only (Permission.MANAGE_CUSTOMER_TAGS). */
export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label!: string;

  /** Hex color, e.g. "#0d9488". Optional — an unset tag falls back to a neutral chip in the UI. */
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;
}

/** PATCH /tags/:id — OWNER/MANAGER only. */
export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string | null;
}
