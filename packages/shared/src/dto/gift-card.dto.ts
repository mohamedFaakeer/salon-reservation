import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "../enums";
import { CreateCustomerDto } from "./customer.dto";
import { PaginationQueryDto } from "./common.dto";

/**
 * POST /gift-cards (API.md) — OWNER, MANAGER only. The purchaser reuses the
 * exact shape a booking's inline `customer` object already uses — same
 * find-or-create-by-phone identity, so a gift card purchase folds into the
 * salon's existing customer records rather than inventing a parallel one.
 */
export class CreateGiftCardDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  /** `YYYY-MM-DD`. Picked by whoever issues the card. */
  @IsDateString()
  expiresAt!: string;

  @ValidateNested()
  @Type(() => CreateCustomerDto)
  purchaser!: CreateCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  recipientEmail?: string;

  /** The personal note — a love note, not a receipt line. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  message?: string;

  /**
   * How the card itself was paid for. Service-layer restricted to
   * CASH/BANK_TRANSFER/CARD_CAPTURED — GIFT_CARD, ONLINE and GATEWAY make no
   * sense as the way somebody paid to create one.
   */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

/** PATCH /gift-cards/:id/void (API.md) — OWNER, MANAGER only. */
export class VoidGiftCardDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** GET /gift-cards — filters. */
export class GiftCardQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
