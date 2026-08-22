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
import { StockMovementType } from "../enums";

/** One physical lot (or one serial unit) received against a `StockReceiptDto`. */
export class StockReceiptBatchDto {
  @IsUUID("4")
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitCostCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lotCode?: string;

  /** `YYYY-MM-DD`. Required at the service layer when the product tracks expiry. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** Required at the service layer when the product tracks serials — one batch row per unit in that case (`quantity` must be 1). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;
}

/** POST /inventory/receipts — receiving stock. No supplier entity/PO chain — CLAUDE.md keeps "purchases" out of scope. */
export class CreateStockReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referenceNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptBatchDto)
  batches!: StockReceiptBatchDto[];
}

/** POST /inventory/adjustments — a manual correction (stock take, breakage) outside the sale/receipt path. */
export class CreateStockAdjustmentDto {
  @IsUUID("4")
  variantId!: string;

  /** Optional: adjust a specific batch's remaining quantity rather than the variant's oldest-first pool. */
  @IsOptional()
  @IsUUID("4")
  batchId?: string;

  /** Signed — negative shrinks stock (breakage, theft, count correction), positive grows it (found stock). */
  @IsInt()
  quantityDelta!: number;

  @IsEnum(StockMovementType)
  type!: StockMovementType.ADJUSTMENT | StockMovementType.WRITE_OFF;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
