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
import { Tenant } from "./tenant.entity";

/**
 * No login, no account (PRD.md Decision Q2) — customers are matched by
 * normalized phone within a tenant. No soft-delete column; customers are
 * never removed, only their appointments change status.
 */
@Entity("customer")
@Index(["tenantId", "phone"], { unique: true })
@Index(["tenantId", "email"], { unique: true, where: '"email" IS NOT NULL' })
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 120 })
  firstName!: string;

  @Column({ type: "varchar", length: 120 })
  lastName!: string;

  /** Normalized: digits only, optional leading "+" (see customer/phone.util.ts). */
  @Column({ type: "varchar", length: 32 })
  phone!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
