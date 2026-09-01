import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "../enums";
import { CreateCustomerDto } from "./customer.dto";
import { PaginationQueryDto } from "./common.dto";

/**
 * A genuinely off-catalog item typed in on the spot — no Product/
 * ProductVariant, no stock impact, the same convention Square/Shopify/Vend
 * use for "sell something not in the catalog yet". `unitPriceCents` is
 * trusted from the client for this one line kind only, and it's fine
 * specifically because nothing catalog-priced is being impersonated — there
 * is no real variant/bundle row this could be mistaken for or undercut.
 */
export class CustomSaleLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  attribute?: string;

  @IsInt()
  @Min(0)
  unitPriceCents!: number;
}

/**
 * One line of the cart being rung up — exactly one of `variantId`/
 * `bundleId`/`custom` (checked at the service layer, where the actual
 * product/bundle lookup already has to happen). `quantity` means units for a
 * variant line, whole bundles for a bundle line, units for a custom line.
 */
export class RetailSaleLineDto {
  @IsOptional()
  @IsUUID("4")
  variantId?: string;

  @IsOptional()
  @IsUUID("4")
  bundleId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomSaleLineDto)
  custom?: CustomSaleLineDto;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * POST /retail-sales/checkout — "ring up items, take payment", reusing the
 * existing cash/bank/card payment machinery rather than a parallel financial
 * system (CLAUDE.md keeps "full POS/ERP" out of scope). `customer` is
 * optional: an omitted value resolves to the tenant's walk-in placeholder.
 */
export class RetailSaleCheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RetailSaleLineDto)
  lines!: RetailSaleLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer?: CreateCustomerDto;

  /** Service-layer restricted to CASH/BANK_TRANSFER/CARD_CAPTURED, same as gift cards and service packages. */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

/** GET /retail-sales — filters. */
export class RetailSaleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}

/**
 * POST /retail-sales/custom-lines/:lineId/convert-to-product — an
 * OWNER/MANAGER turning a sold custom line into a real catalog product.
 * Exactly one of `productId` (attach a new variant to an existing product)
 * or `productName` (create a new product) is required — checked at the
 * service layer, the same place `CreateProductDto`'s own fields already get
 * validated once this delegates to `ProductService`. Deliberately has no
 * opening-stock fields: this adds a catalog entry, not stock — receiving
 * stock stays the existing, separate Stock Receipt action.
 */
export class ConvertCustomLineDto {
  @IsOptional()
  @IsUUID("4")
  productId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsString()
  @MaxLength(64)
  sku!: string;

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
}
