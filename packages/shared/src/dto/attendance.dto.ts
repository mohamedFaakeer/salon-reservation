import { IsDateString, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { AttendanceEditRequestStatus } from "../enums";

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

/**
 * POST /attendance/edit-requests.
 *
 * `workDate` is required even when a row already exists for it, because the
 * commoner case is that nothing exists yet — a forgotten check-in has no
 * AttendanceDay to reference, only a date and a claim about what happened
 * on it.
 *
 * At least one of the two requested times must be present (service-layer
 * check — expressing "not both null" as a decorator is not worth the
 * unreadability). Whichever is omitted means "leave that end alone": someone
 * who forgot only to check out does not need to re-state a check-in that was
 * already correct.
 */
export class CreateAttendanceEditRequestDto {
  @IsOptional()
  @IsUUID("4")
  staffId?: string;

  @IsDateString()
  workDate!: string;

  @IsOptional()
  @IsISO8601()
  requestedCheckInAt?: string;

  @IsOptional()
  @IsISO8601()
  requestedCheckOutAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/**
 * PATCH /attendance/edit-requests/:id — approve or reject.
 *
 * `note` is optional on approval (the times speak for themselves) but is
 * where a rejection earns its keep: "declined, no note" leaves the person who
 * asked with nothing to act on.
 */
export class DecideAttendanceEditRequestDto {
  @IsIn([AttendanceEditRequestStatus.APPROVED, AttendanceEditRequestStatus.REJECTED])
  status!: AttendanceEditRequestStatus.APPROVED | AttendanceEditRequestStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** GET /attendance/edit-requests — filters. */
export class AttendanceEditRequestQueryDto {
  @IsOptional()
  @IsIn(Object.values(AttendanceEditRequestStatus))
  status?: AttendanceEditRequestStatus;

  @IsOptional()
  @IsUUID("4")
  staffId?: string;
}
