import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "../enums";
import { CreateCustomerDto } from "./customer.dto";
import { PaginationQueryDto } from "./common.dto";

/**
 * One line of the cart being rung up — exactly one of `variantId`/`bundleId`
 * (checked at the service layer, where the actual product/bundle lookup
 * already has to happen). `quantity` means units for a variant line, whole
 * bundles for a bundle line.
 */
export class RetailSaleLineDto {
  @IsOptional()
  @IsUUID("4")
  variantId?: string;

  @IsOptional()
  @IsUUID("4")
  bundleId?: string;

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
