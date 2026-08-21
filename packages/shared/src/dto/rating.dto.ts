import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

/**
 * POST /bookings/:reference/rating — the customer rating their own visit.
 *
 * Authenticated the same way as viewing or cancelling a booking: the reference
 * code plus the phone number it was booked with. There is no account to sign
 * into, and inventing one for feedback would be the worst possible place to
 * start asking.
 */
export class SubmitRatingDto {
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/, { message: "Enter the phone number used to book." })
  phone!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
