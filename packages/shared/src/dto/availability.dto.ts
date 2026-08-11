import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsUUID } from "class-validator";

/** POST /salons/:slug/availability (API.md §"Public Salon Discovery") — public, no auth. */
export class AvailabilityQueryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  serviceIds!: string[];

  /** Preferred staff member; omit for "Any Available Staff". */
  @IsOptional()
  @IsUUID("4")
  staffId?: string;

  @IsDateString()
  date!: string;
}
