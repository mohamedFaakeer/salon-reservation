import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Branch } from "./branch.entity";
import { IncentivePlan } from "./incentive-plan.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/** No soft-delete column — removal is PATCH {active:false} (API.md §3). */
@Entity("staff")
@Index(["tenantId", "userId"], { unique: true, where: '"userId" IS NOT NULL' })
export class Staff {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  /** Always null in MVP (single-branch-per-tenant) — see DECISIONS.md. */
  @Column({ type: "uuid", nullable: true })
  branchId!: string | null;

  @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "branchId" })
  branch!: Branch | null;

  /** Staff may or may not have a login — set only when linking to an existing user. */
  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "userId" })
  user!: User | null;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: "text", nullable: true })
  specialties!: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  /** Hex color for calendar display (e.g. "#4F46E5"). */
  @Column({ type: "varchar", length: 7, nullable: true })
  color!: string | null;

  /** The commission/incentive plan this stylist earns under, if any. */
  @Column({ type: "uuid", nullable: true })
  incentivePlanId!: string | null;

  @ManyToOne(() => IncentivePlan, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "incentivePlanId" })
  incentivePlan!: IncentivePlan | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
