import { IsDateString, IsOptional, IsUUID } from "class-validator";

/**
 * POST /attendance/check-in and /attendance/check-out.
 *
 * There is deliberately no time field. A punch means *now*, on the server's
 * clock, whoever pressed it — because a client-supplied time is a forged
 * arrival waiting to happen, and the whole point of an attendance record is
 * that it was not typed in afterwards.
 *
 * Corrections exist, and they go through the edit-request flow where somebody
 * with authority sees the reason and approves it. That is the only route by
 * which a recorded time ever moves.
 *
 * `staffId` omitted means "me": a staff member punching themselves in. Naming
 * somebody else requires RECORD_ATTENDANCE, which the front desk holds and a
 * stylist does not.
 */
export class AttendancePunchDto {
  @IsOptional()
  @IsUUID("4")
  staffId?: string;
}

/** GET /attendance — the day rows behind the board and the history screen. */
export class AttendanceQueryDto {
  /** Local `YYYY-MM-DD`, inclusive. Defaults with `to` to today. */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID("4")
  staffId?: string;
}
