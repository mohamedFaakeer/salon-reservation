import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "../enums";
import { CreateCustomerDto } from "./customer.dto";
import { PaginationQueryDto } from "./common.dto";

/**
 * POST /service-packages (API.md) — OWNER, MANAGER only. `customer` reuses
 * the same find-or-create-by-phone shape a booking's inline `customer`
 * object and a gift card's `purchaser` already use.
 */
export class CreateServicePackageDto {
  /** The one service this package redeems against — v1 is single-service only. */
  @IsUUID("4")
  serviceId!: string;

  /** A single-use "package" is just a payment, so this starts at 2. */
  @IsInt()
  @Min(2)
  totalUses!: number;

  /** What was actually paid for the whole package — may be less than `totalUses` × the service's price; that gap is the discount, not separately modeled. */
  @IsInt()
  @Min(1)
  purchasePriceCents!: number;

  /** `YYYY-MM-DD`. Picked by whoever issues the package. */
  @IsDateString()
  expiresAt!: string;

  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer!: CreateCustomerDto;

  /**
   * How the package itself was paid for. Service-layer restricted to
   * CASH/BANK_TRANSFER/CARD_CAPTURED, same as gift cards.
   */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

/** PATCH /service-packages/:id/void (API.md) — OWNER, MANAGER only. */
export class VoidServicePackageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** GET /service-packages — filters. */
export class ServicePackageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
