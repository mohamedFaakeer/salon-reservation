import { IsDateString, IsIn, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "./common.dto";

/** The five audit actions the super-admin monitoring feature treats as security events. */
export const SECURITY_EVENT_ACTIONS = [
  "LOGIN_FAILED",
  "CROSS_TENANT_TOKEN_REJECTED",
  "REFRESH_TOKEN_REUSE_DETECTED",
  "RATE_LIMIT_EXCEEDED",
] as const;
export type SecurityEventAction = (typeof SECURITY_EVENT_ACTIONS)[number];

export type MonitoringSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type MonitoringItemStatus = "NEW" | "ACKNOWLEDGED" | "RESOLVED";

/** GET /super-admin/monitoring/security-events */
export class MonitoringSecurityEventQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn(SECURITY_EVENT_ACTIONS)
  action?: SecurityEventAction;

  @IsOptional()
  @IsIn(["NEW", "ACKNOWLEDGED", "RESOLVED"])
  status?: MonitoringItemStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** GET /super-admin/monitoring/errors */
export class MonitoringErrorQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsIn(["NEW", "ACKNOWLEDGED", "RESOLVED"])
  status?: MonitoringItemStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** PATCH /super-admin/monitoring/(errors|security-events)/:id/status */
export class UpdateMonitoringStatusDto {
  @IsIn(["ACKNOWLEDGED", "RESOLVED"])
  status!: "ACKNOWLEDGED" | "RESOLVED";
}
