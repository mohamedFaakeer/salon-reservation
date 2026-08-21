import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
// Only ever the column's TypeScript type here — the column itself is varchar.
import type { DiscountType } from "@salon/shared";
import { Service } from "./service.entity";
import { Tenant } from "./tenant.entity";

/**
 * A standing offer on one service.
 *
 * Exactly one per service, enforced by a unique index rather than convention.
 * Two overlapping discounts on the same service would need precedence rules
 * that nobody has asked for, and "which one applied?" is not a question a
 * receipt should ever have to answer ambiguously.
 *
 * The offer is evaluated against the **appointment's** start time, not the
 * moment of booking: "Tuesday 20% off" in a salon means the chair is occupied
 * on a Tuesday. See DECISIONS.md.
 */
@Entity("service_discount")
@Index(["tenantId"])
export class ServiceDiscount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: "CASCADE" })
  @JoinColumn({ name: "serviceId" })
  service!: Service;

  @Column({ type: "varchar", length: 10 })
  type!: DiscountType;

  /** Cents when FIXED, whole percent when PERCENT. The type says which. */
  @Column({ type: "int" })
  value!: number;

  /** Local calendar dates, inclusive at both ends. */
  @Column({ type: "date" })
  startDate!: string;

  @Column({ type: "date" })
  endDate!: string;

  /** What the customer sees it called. Falls back to a generated phrase. */
  @Column({ type: "varchar", length: 60, nullable: true })
  label!: string | null;

  /**
   * Switched off rather than deleted, so an offer can be paused and brought
   * back without retyping its hours — and so the audit trail keeps its shape.
   */
  @Column({ type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => ServiceDiscountWindow, (w) => w.discount)
  windows!: ServiceDiscountWindow[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

/**
 * One weekday slice when the offer is live.
 *
 * No rows at all means "all day, every day inside the date range" — the
 * common case, and therefore the one that should need no configuration.
 *
 * `endMin` is exclusive and may be 1440, unlike WorkingSchedule's: "until
 * midnight" is a real thing to say about an offer, and capping at 1439 would
 * quietly exclude the last minute of the day.
 */
@Entity("service_discount_window")
@Index(["discountId"])
export class ServiceDiscountWindow {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  discountId!: string;

  @ManyToOne(() => ServiceDiscount, (d) => d.windows, { onDelete: "CASCADE" })
  @JoinColumn({ name: "discountId" })
  discount!: ServiceDiscount;

  /** 0=Mon..6=Sun, matching WorkingSchedule. */
  @Column({ type: "int" })
  dayOfWeek!: number;

  @Column({ type: "int" })
  startMin!: number;

  @Column({ type: "int" })
  endMin!: number;
}
