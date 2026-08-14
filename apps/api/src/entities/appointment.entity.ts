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
import { AppointmentStatus, type BookingSource } from "@salon/shared";
import { Branch } from "./branch.entity";
import { Customer } from "./customer.entity";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";

/**
 * The heart of the product (DATABASE.md §2.4). Created only at confirm time
 * (P10 — see DECISIONS.md for the reserve/confirm timing resolution), never
 * at hold time. A GiST exclusion constraint (migration-only) blocks
 * overlapping active-status rows for the same staff.
 *
 * Columns this phase doesn't actively populate yet (`cancellationReason`,
 * `cancelledAt`, `rescheduledFromId`, `discountCents` beyond 0) exist per the
 * documented schema so P13/P14 need no further migration for them.
 */
@Entity("appointment")
@Index(["tenantId", "appointmentDate", "status"])
@Index(["staffId", "appointmentDate"])
@Check("CHK_appointment_time_range", `"endTime" > "startTime"`)
export class Appointment {
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

  @Index()
  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  @Column({ type: "uuid" })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: "CASCADE" })
  @JoinColumn({ name: "staffId" })
  staff!: Staff;

  @Column({ type: "date" })
  appointmentDate!: string;

  @Column({ type: "timestamptz" })
  startTime!: Date;

  @Column({ type: "timestamptz" })
  endTime!: Date;

  @Column({ type: "varchar", length: 20, default: AppointmentStatus.CONFIRMED })
  status!: AppointmentStatus;

  @Column({ type: "varchar", length: 20 })
  source!: BookingSource;

  @Column({ type: "int" })
  subtotalCents!: number;

  @Column({ type: "int", default: 0 })
  discountCents!: number;

  @Column({ type: "int" })
  totalCents!: number;

  /** Real advance-rule evaluation is P13's job — always 0 for now. */
  @Column({ type: "int", default: 0 })
  advanceRequiredCents!: number;

  @Column({ type: "int", default: 0 })
  advancePaidCents!: number;

  @Column({ type: "int" })
  balanceCents!: number;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 20 })
  bookingReference!: string;

  @Column({ type: "timestamptz", nullable: true })
  holdExpiresAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  checkedInAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  inServiceAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @Column({ type: "int", default: 0 })
  lateMinutes!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  cancellationReason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  rescheduledFromId!: string | null;

  @ManyToOne(() => Appointment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "rescheduledFromId" })
  rescheduledFrom!: Appointment | null;

  @Column({ type: "int", default: 1 })
  version!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
