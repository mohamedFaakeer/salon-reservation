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
}

