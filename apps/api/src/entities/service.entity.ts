import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Branch } from "./branch.entity";
import { ServiceDiscount } from "./service-discount.entity";
import { Tenant } from "./tenant.entity";

/**
 * No soft-delete column — removal is PATCH {active:false} (API.md §3).
 *
 * `name` is unique per tenant among active services only (case-insensitive)
 * via the partial index `IDX_service_tenantId_name_active` (migration
 * `1750001300000-ServiceNameUnique`, SVC-02) — retiring a service frees its
 * name for reuse. TypeORM has no first-class partial/expression-index
 * decorator, so the index lives in the migration only; `ServiceService`
 * enforces the same rule at the application layer for a friendly error
 * ahead of the constraint.
 */
@Entity("service")
@Check("CHK_service_durationMin", `"durationMin" > 0`)
@Check("CHK_service_priceCents", `"priceCents" >= 0`)
export class Service {
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

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 60, nullable: true })
  category!: string | null;

  @Column({ type: "int" })
  durationMin!: number;

  @Column({ type: "int" })
  priceCents!: number;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  /**
   * At most one standing offer, enforced by a unique index on the child. Two
   * overlapping discounts would need precedence rules nobody asked for.
   */
  @OneToOne(() => ServiceDiscount, (d) => d.service)
  discount!: ServiceDiscount | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
