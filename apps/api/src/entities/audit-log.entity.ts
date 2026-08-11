import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * An audit trail must outlive what it describes — both FKs are SET NULL,
 * never CASCADE (CLAUDE.md: "preserve ... audit rows").
 */
@Entity("audit_log")
@Index(["tenantId", "createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  tenantId!: string | null;

  @ManyToOne(() => Tenant, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant | null;

  @Column({ type: "uuid", nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "actorUserId" })
  actorUser!: User | null;

  /** SCREAMING_SNAKE_CASE, e.g. SERVICE_PRICE_CHANGED (SECURITY.md §10). */
  @Column({ type: "varchar", length: 60 })
  action!: string;

  @Column({ type: "varchar", length: 60 })
  entityType!: string;

  /** Plain string, not an FK — the target entity type varies. */
  @Column({ type: "varchar", length: 64 })
  entityId!: string;

  @Column({ type: "jsonb", default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
