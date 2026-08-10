import type { UserRole } from "@salon/shared";
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Branch } from "./branch.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

@Entity("user_tenant_role")
export class UserTenantRole {
  @PrimaryColumn({ type: "uuid" })
  userId!: string;

  @PrimaryColumn({ type: "uuid" })
  tenantId!: string;

  @Column({ type: "varchar", length: 20 })
  role!: UserRole;

  @Index()
  @Column({ type: "uuid", nullable: true })
  branchId!: string | null;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "branchId" })
  branch!: Branch | null;
}