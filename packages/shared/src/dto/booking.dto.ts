import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { CreateCustomerDto } from "./customer.dto";

/** POST /salons/:slug/bookings (API.md §2) — public, requires Idempotency-Key header. */
export class CreateBookingDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  serviceIds!: string[];

  @IsUUID("4")
  staffId!: string;

  /** ISO 8601 instant — one of the exact `start` values returned by the availability engine. */
  @IsDateString()
  start!: string;

  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer!: CreateCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class ProviderDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** POST /payments/:intentId/confirm — Idempotency-Key must match the booking's. */
export class ConfirmPaymentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderDataDto)
  providerData?: ProviderDataDto;

  /**
   * Applied against the advance due, server-computed (never a client-sent
   * amount) — `min(card balance, advanceRequiredCents)`. Validated and
   * redeemed for real inside the same transaction as the appointment/payment
   * insert, not reserved at hold time.
   */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  giftCardCode?: string;
}

/** POST /payments/:intentId/gift-card-preview — a pure read, no mutation. */
export class GiftCardPreviewDto {
  @IsString()
  @MaxLength(24)
  code!: string;
}
