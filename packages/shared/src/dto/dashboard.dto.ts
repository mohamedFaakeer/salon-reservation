import { IsDateString, IsOptional } from "class-validator";

/**
 * GET /dashboard — a closed date range, inclusive at both ends.
 *
 * Both bounds are optional and default to today, so the endpoint with no query
 * is the day board it replaces. Dates are `YYYY-MM-DD` in the salon's local
 * calendar, matching `appointmentDate` on the row rather than a UTC instant —
 * an appointment at 9pm Colombo belongs to that day, not the next one.
 */
export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
