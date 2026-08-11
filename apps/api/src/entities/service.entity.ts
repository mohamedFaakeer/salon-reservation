import {
  Check,
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
import { Tenant } from "./tenant.entity";

/** No soft-delete column — removal is PATCH {active:false} (API.md §3). */
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

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
