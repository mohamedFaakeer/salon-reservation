import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { RetailReturnDisposition } from "../enums";

/**
 * One returned line. RESTOCK on a lot-tracked/untracked product creates a
 * fresh batch at the original sale line's cost — `expiresAt`/`lotCode` are
 * only meaningful there. RESTOCK on a serialised product instead reactivates
 * the exact original serial (a fresh batch would collide with the still-on-
 * file original), so `serialNumber` is required in that case instead.
 * QUARANTINE needs none of these — it never touches a batch.
 */
export class RetailReturnLineDto {
  @IsUUID("4")
  saleLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(RetailReturnDisposition)
  disposition!: RetailReturnDisposition;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;
}

/**
 * POST /retail-sales/:saleId/returns — OWNER, MANAGER only (ISSUE_REFUND):
 * a return can move real money back out, the same gate an appointment
 * refund already uses. `refundCents` is staff-entered and optional — omit
 * it (or 0) for an even exchange with no money changing hands.
 */
export class CreateRetailReturnDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RetailReturnLineDto)
  lines!: RetailReturnLineDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  refundCents?: number;
}
