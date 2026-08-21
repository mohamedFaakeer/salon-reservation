import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { DiscountType } from "../enums";

/**
 * PATCH /appointments/:id/discount — a discount on the bill, applied at the
 * desk rather than attached to a service.
 *
 * Separate from a service offer on purpose. An offer is configuration the
 * salon publishes; this is a judgement somebody made about one customer, so
 * it carries a reason and names whoever made it in the audit trail.
 *
 * Sending `value: 0` removes it.
 */
export class SetAppointmentDiscountDto {
  @IsEnum(DiscountType)
  type!: DiscountType;

  /** Cents when FIXED, whole percent when PERCENT. Zero clears the discount. */
  @IsInt()
  @Min(0)
  value!: number;

  /**
   * Why. Not decoration: a discount is money leaving the business, and the
   * audit row is worth little if it cannot say what it was for.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
