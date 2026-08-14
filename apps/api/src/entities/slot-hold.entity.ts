import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { SlotHoldStatus } from "@salon/shared";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";

/**
 * 10-minute temporary slot hold (DATABASE.md §2.4). A GiST exclusion
 * constraint (migration-only, not expressible via TypeORM decorators) blocks
 * overlapping HELD rows for the same staff — see 1700000600000-Appointments.
 *
 * `sessionKey` doubles as a booking-level idempotency key: unique per
 * (tenantId, sessionKey) so a retried `POST /bookings` with the same
 * `Idempotency-Key` header returns the existing hold instead of a duplicate.
 *
 * `bookingSnapshot` captures what `confirmHold` needs to create the
 * Appointment later — `POST /payments/:intentId/confirm`'s body carries no
 * service/customer info (API.md), so it must be persisted at reserve time,
 * not re-derived at confirm time (which could pick up a since-changed
 * price). Both additions are deliberate, documented deviations beyond
 * DATABASE.md's bare field list — see DECISIONS.md.
 */
@Entity("slot_hold")
@Index(["tenantId", "sessionKey"], { unique: true, where: '"sessionKey" IS NOT NULL' })
@Check("CHK_slot_hold_time_range", `"endTime" > "startTime"`)
export class SlotHold {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  staffId!: string;

  @ManyToOne(() => Staff, { onDelete: "CASCADE" })
  @JoinColumn({ name: "staffId" })
  staff!: Staff;

  @Column({ type: "timestamptz" })
  startTime!: Date;

  @Column({ type: "timestamptz" })
  endTime!: Date;

  @Column({ type: "varchar", length: 20, default: SlotHoldStatus.HELD })
  status!: SlotHoldStatus;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  sessionKey!: string | null;

  @Column({ type: "jsonb", nullable: true })
  bookingSnapshot!: BookingSnapshot | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

export interface BookingSnapshotLine {
  serviceId: string;
  nameSnapshot: string;
  durationMinSnapshot: number;
  priceCentsSnapshot: number;
}

export interface BookingSnapshot {
  customerId: string;
  notes: string | null;
  lines: BookingSnapshotLine[];
  /** Pre-chosen at reserve time so the reference shown to the customer never changes at confirm time. */
  bookingReference: string;
}
