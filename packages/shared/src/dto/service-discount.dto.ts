import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { DiscountType } from "../enums";

/**
 * One slice of a week when a service discount is live.
 *
 * Same shape and numbering as WorkingSchedule (0=Mon..6=Sun, minutes since
 * midnight) rather than a second convention, because an operator reading
 * "Tuesday 17:00–20:00" on the rota and on an offer should not have to learn
 * two ways of saying it.
 */
export class ServiceDiscountWindowDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  /**
   * Exclusive. 1440 is allowed here, unlike on the rota: "until midnight" is a
   * real thing to say about an offer, and `endMin` capped at 1439 would leave
   * the last minute of the day uncovered.
   */
  @IsInt()
  @Min(1)
  @Max(1440)
  endMin!: number;
}

/**
 * PUT /services/:id/discount — OWNER, MANAGER only.
 *
 * Replaces the service's discount wholesale rather than patching it. A
 * discount is one coherent offer — type, amount, dates and hours together —
 * and partial updates to it invite states like "20% off, dates cleared" that
 * mean nothing.
 *
 * An empty `windows` array means the offer runs all day for every day inside
 * the date range. That is the common case ("20% off this September"), so it
 * is the one that needs no configuration.
 */
export class SetServiceDiscountDto {
  @IsEnum(DiscountType)
  type!: DiscountType;

  /**
   * Cents when `type` is FIXED, whole percent when PERCENT. The service layer
   * range-checks it against the type — 150 is a valid rupee amount and an
   * impossible percentage, and only the type says which this is.
   */
  @IsInt()
  @Min(1)
  value!: number;

  /** Local `YYYY-MM-DD`, inclusive. */
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  /** Shown to customers, so it has to read as an offer rather than a rule. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => ServiceDiscountWindowDto)
  windows?: ServiceDiscountWindowDto[];
}
