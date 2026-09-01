import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PaginationQueryDto } from "./common.dto";

/** POST /products — the sellable concept ("Sunsilk Shampoo"), not a specific SKU. */
export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Variants of this product require an `expiresAt` on every stock batch. */
  @IsOptional()
  @IsBoolean()
  tracksExpiry?: boolean;

  /** Variants of this product require a `serialNumber` on every stock batch. */
  @IsOptional()
  @IsBoolean()
  trackSerial?: boolean;
}

/** PATCH /products/:id */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  tracksExpiry?: boolean;

  @IsOptional()
  @IsBoolean()
  trackSerial?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** GET /products — filters. */
export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeInactive?: boolean;
}

/** POST /products/:productId/variants — the actual SKU. */
export class CreateProductVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  /** Free-form, e.g. `{"color":"Green","size":"400ml"}` — no schema validation, same restraint as Service.category. */
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  /**
   * Optional opening stock, folded into the same request so a brand-new
   * variant can be sellable the moment it's created — the alternative was
   * always "use Adjust with no batch to fake a starting count," which is
   * exactly the phantom-stock bug this DTO closes off. `openingQuantity` and
   * `openingUnitCostCents` are required together; a product that tracks
   * expiry additionally requires `openingExpiresAt`, one that tracks serials
   * additionally requires `openingSerialNumber` (and then `openingQuantity`
   * must be exactly 1 — one serial per unit, same rule Receive stock uses).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  openingQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  openingUnitCostCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  openingLotCode?: string;

  /** `YYYY-MM-DD`. Required at the service layer when the product tracks expiry. */
  @IsOptional()
  @IsDateString()
  openingExpiresAt?: string;

  /** Required at the service layer when the product tracks serials — `openingQuantity` must then be exactly 1. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  openingSerialNumber?: string;
}

/** PATCH /products/:productId/variants/:variantId — identity/price fields only; stock moves through StockReceipt/Adjustment. */
export class UpdateProductVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** GET /product-variants — the lookup endpoint both manual entry and camera scanning hit. */
export class VariantLookupQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  /** Exact barcode match — what a scan or a scanner-gun keystroke sends. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  lowStockOnly?: boolean;

  /** Quick Sale's filter pills — exact match against the product's own free-text field, additive to `q`. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
