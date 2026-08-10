import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";

/** POST /closures (API.md §3) — OWNER, MANAGER only. */
export class CreateClosureDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
