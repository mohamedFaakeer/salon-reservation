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
import type { Province } from "@salon/shared";
import { Tenant } from "./tenant.entity";

/**
 * Tenant-scoped booking history — matched by normalized phone within a
 * tenant, and still exactly how a guest booking (no account) works (PRD.md
 * Decision Q2). A separate, platform-level `CustomerAccount` now optionally
 * exists alongside this (DECISIONS.md); `CustomerAccountSalonLink` connects
 * the two without this entity itself changing. No soft-delete column;
 * customers are never removed, only their appointments change status.
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

  /** Staff-set: excludes this customer from win-back/marketing sends. Never affects transactional notifications (booking/payment/reminder). */
  @Column({ type: "boolean", default: false })
  marketingOptOut!: boolean;

  /**
   * The tenant's one lazily-created "Walk-in customer" row, used by retail
   * checkout when no customer is attached. `Payment.customerId` stays
   * NOT NULL rather than becoming nullable — see `CustomerService.findOrCreateWalkIn`.
   * Every place that broadly enumerates customers (search, reports, win-back
   * candidate selection) filters this flag out explicitly.
   */
  @Column({ type: "boolean", default: false })
  isWalkInPlaceholder!: boolean;

  /** Built-in (Mr./Mrs./Ms./Dr.) or a tenant-custom value — resolved plain text, same treatment `Service.category` already gets. Not identifying enough on its own to need clearing on tenant-offboarding purge. */
  @Column({ type: "varchar", length: 40, nullable: true })
  title!: string | null;

  @Column({ type: "date", nullable: true })
  dateOfBirth!: string | null;

  /** Cloudinary URL, same pattern as `Staff.imageUrl` — a real column, never the tenant settings JSONB. Cleared on tenant-offboarding purge (real PII). */
  @Column({ type: "varchar", length: 500, nullable: true })
  profileImageUrl!: string | null;

  /** Built-in (walk-in/web app/referral) or a tenant-custom value — resolved plain text. Deliberately not read by the "Web Customers" segment, which derives channel from real `Appointment.source` history instead of trusting this manually-set field. */
  @Column({ type: "varchar", length: 60, nullable: true })
  clientSource!: string | null;

  /** Cleared on tenant-offboarding purge (real PII, tied to a home address). */
  @Column({ type: "varchar", length: 255, nullable: true })
  address!: string | null;

  /** Cleared on tenant-offboarding purge alongside `address`. */
  @Column({ type: "varchar", length: 20, nullable: true })
  province!: Province | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
