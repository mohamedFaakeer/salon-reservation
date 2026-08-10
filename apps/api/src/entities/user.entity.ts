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

  @Column({ type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}