import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type SecurityEventStatus = "ACKNOWLEDGED" | "RESOLVED";

/**
 * Triage state for a security-relevant `AuditLog` row (`LOGIN_FAILED`,
 * `CROSS_TENANT_TOKEN_REJECTED`, `REFRESH_TOKEN_REUSE_DETECTED`,
 * `RATE_LIMIT_EXCEEDED`) — a companion table rather than columns on
 * `AuditLog` itself, because `AuditLog` stays the immutable, general-purpose
 * ledger it already is (compliance history of ordinary business actions,
 * not just security events); bolting mutable operator-triage state onto it
 * would apply to every audited action, not just the handful that need it.
 *
 * One row per audit log entry, created lazily the first time it's triaged —
 * absence of a row means the event is still `NEW` (that state needs no
 * storage, so it isn't a third enum value here).
 */
@Entity("security_event_review")
export class SecurityEventReview {
  /** The `AuditLog.id` this review applies to — one row per event, not an FK (AuditLog rows are never deleted, but this stays independent for the same reason AuditLog itself avoids CASCADE). */
  @PrimaryColumn({ type: "uuid" })
  auditLogId!: string;

  @Column({ type: "varchar", length: 20 })
  status!: SecurityEventStatus;

  @Column({ type: "uuid", nullable: true })
  reviewedByUserId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
