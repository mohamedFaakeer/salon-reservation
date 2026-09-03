import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

/** POST /staff/:id/leave (API.md §3) — OWNER, MANAGER only. */
export class CreateStaffLeaveDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Whether Payroll should treat this leave as earning pay. Defaults to `true` if omitted — see StaffLeave.paid. */
  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}
