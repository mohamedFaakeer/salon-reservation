import { IsDateString, IsIn, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "./common.dto";

/** The audit actions the super-admin monitoring feature treats as security events. */
export const SECURITY_EVENT_ACTIONS = [
  "LOGIN_FAILED",
  "CROSS_TENANT_TOKEN_REJECTED",
  "REFRESH_TOKEN_REUSE_DETECTED",
  "RATE_LIMIT_EXCEEDED",
  /** An account was hard-locked after 5 wrong passwords in a row (account-lockout-v2, DECISIONS.md). */
  "ACCOUNT_LOCKED",
  /**
   * Routine remediation, not a threat signal — always LOW severity, never
   * alerts (see classify-severity.ts) — included so a super admin scanning
   * one tenant's feed sees the whole story (locked → who reset it → when)
   * in one list rather than needing a second screen.
   */
  "TEAM_MEMBER_PASSWORD_RESET",
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
