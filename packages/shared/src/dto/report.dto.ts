import { IsDateString, IsOptional } from "class-validator";

/**
 * GET /reports — one closed, inclusive date range for the whole module.
 *
 * Deliberately the same shape and defaults as DashboardQueryDto, and resolved
 * by the same server-side helper: a reports page and a dashboard that quietly
 * cover different days is a bug nobody reports, because both look plausible.
 *
 * Every panel obeys this range. The two that need explaining are documented on
 * the service: the funnel counts what *arrived* in the period rather than what
 * happens in it, and lapsed customers are measured as of the range's end.
 */
export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
