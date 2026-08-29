import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type ErrorLogStatus = "NEW" | "ACKNOWLEDGED" | "RESOLVED";

/**
 * Persisted 5xx errors, written by `ApiExceptionFilter` alongside its
 * existing console log line — this project has no third-party error tracker
 * (Sentry etc. explicitly declined for MVP cost/scope reasons), so this is
 * the only historical record of what broke and for which tenant.
 *
 * No FK to Tenant: an error can legitimately happen with no tenant resolved
 * yet (a malformed request before auth runs), and this table must never be
 * the reason a tenant can't be deleted/cleaned up — `tenantId` is a plain
 * nullable column, same reasoning `AuditLog` uses for its own value columns
 * elsewhere.
 *
 * `message` follows the exact same "no PII" sanitization the console log
 * line already applies (SECURITY.md §9) — never the raw request body.
 * `status` is mutable operator triage state (NEW → ACKNOWLEDGED/RESOLVED),
 * the one field on this table that isn't a fact captured at write time.
 */
@Entity("error_log")
@Index(["tenantId", "createdAt"])
@Index(["status", "createdAt"])
export class ErrorLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  tenantId!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  requestId!: string | null;

  @Column({ type: "varchar", length: 10 })
  method!: string;

  @Column({ type: "varchar", length: 255 })
  path!: string;

  @Column({ type: "int" })
  statusCode!: number;

  @Column({ type: "varchar", length: 60 })
  code!: string;

  @Column({ type: "varchar", length: 500 })
  message!: string;

  @Column({ type: "text", nullable: true })
  stack!: string | null;

  @Column({ type: "varchar", length: 20, default: "NEW" })
  status!: ErrorLogStatus;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
