import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { PaymentMethod, PaymentStatus, PaymentType } from "../enums";
import { PaginationQueryDto } from "./common.dto";

/** POST /appointments/:id/payments (API.md §3) — OWNER, MANAGER, RECEPTIONIST. */
export class RecordPaymentDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsEnum(PaymentType)
  type!: PaymentType;

  /** Required by the service (not this decorator) only when `method` is GIFT_CARD. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  giftCardCode?: string;

  /** Required by the service (not this decorator) only when `method` is PACKAGE_CREDIT. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  packageCode?: string;
}

/** POST /payments/:id/refund (API.md §3) — OWNER, MANAGER only. */
export class RefundPaymentDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** GET /payments — filters (API.md §3). */
export class PaymentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID("4")
  appointmentId?: string;

  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  /** Filter by payment state, e.g. only what still needs reconciling. */
  @IsOptional()
  @IsEnum(PaymentStatus)
  state?: PaymentStatus;

  /** A gift card's full redemption history — every payment it was drawn against. */
  @IsOptional()
  @IsUUID("4")
  giftCardId?: string;

  /** A service package's full redemption history — every payment it was drawn against. */
  @IsOptional()
  @IsUUID("4")
  packageRedemptionId?: string;
}

