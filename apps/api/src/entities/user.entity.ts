import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { UserStatus } from "../enums/user-status.enum";

@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: UserStatus;

  /** Platform-level SUPER_ADMIN flag — this role has no tenantId, so it can't
   * live in user_tenant_role (NOT NULL tenantId). See DECISIONS.md. */
  @Column({ type: "boolean", default: false })
  isSuperAdmin!: boolean;

  /**
   * Persisted, not derived from `audit_log` — once a manual-reset lockout
   * exists there's nothing left to "expire" on a timer, so a plain counter
   * replaces the old sliding-window query entirely (DECISIONS.md). Reset to
   * 0 on a successful login or a password reset.
   */
  @Column({ type: "int", default: 0 })
  failedLoginAttempts!: number;

  /**
   * True whenever the current password was set by someone other than the
   * account holder (creation, or an OWNER/MANAGER/SUPER_ADMIN reset) — the
   * next successful login must change it before a real session is issued
   * (DECISIONS.md). Cleared the moment they set their own.
   */
  @Column({ type: "boolean", default: false })
  mustChangePassword!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}