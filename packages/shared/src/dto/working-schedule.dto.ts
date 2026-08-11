import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

/** POST /schedules (API.md §3) — OWNER, MANAGER only. */
export class CreateWorkingScheduleDto {
  @IsUUID()
  staffId!: string;

  /** 0=Mon..6=Sun. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** Minutes since midnight. */
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  endMin!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  breakStartMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  breakEndMin?: number;
}

/**
 * PATCH /schedules/:id — hours/breaks only. staffId/dayOfWeek identify which
 * row this is and aren't editable; delete + recreate to move a schedule to
 * a different staff member or weekday.
 */
export class UpdateWorkingScheduleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  endMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  breakStartMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  breakEndMin?: number;
}
