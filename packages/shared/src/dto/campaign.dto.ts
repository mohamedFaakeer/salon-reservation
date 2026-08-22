import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

/**
 * POST /reports/lapsed-customers/winback (API.md) — OWNER, MANAGER only.
 * The audience is exactly the lapsed-customer list the report already
 * computes (capped at 25 rows there), never an open recipient picker.
 */
export class SendWinbackCampaignDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @IsUUID("4", { each: true })
  customerIds!: string[];

  /** Free text, with `{firstName}`/`{salonName}` tokens substituted server-side per recipient. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  message!: string;

  /** Optional — a code the sender already created via Gift Cards, dropped into the message as-is. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  giftCardCode?: string;
}
