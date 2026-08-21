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
import type { AttendanceEditRequestStatus } from "@salon/shared";
import { AttendanceDay } from "./attendance-day.entity";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * A correction, asked for and decided.
 *
 * `attendanceId` is nullable because the commoner case is not "fix a wrong
 * time" but "there is no row at all" — a check-in nobody ever pressed.
 * Approving one of those creates the AttendanceDay; approving the other
 * updates it. Either way this row is what carries the reason, which is the
 * entire point of the flow existing.
 *
 * `previous*At` is filled in when the request is filed, not left to be
 * inferred later from whatever the row happens to say by then — a decision
 * made next week should still show what actually changed, not what changed
 * since.
 */
@Entity("attendance_edit_request")
@Index(["tenantId", "status"])
@Index(["staffId", "workDate"], { unique: true, where: `"status" = 'PENDING'` })
@Check(
  "CHK_attendance_edit_decided",
  `("status" IN ('PENDING', 'WITHDRAWN') AND "decidedBy" IS NULL AND "decidedAt" IS NULL)
   OR ("status" IN ('APPROVED', 'REJECTED') AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)`,
)
@Check(
  "CHK_attendance_edit_requested_order",
  `"requestedCheckOutAt" IS NULL OR "requestedCheckOutAt" > "requestedCheckInAt"`,
)
@Check(
  "CHK_attendance_edit_has_request",
  `"requestedCheckInAt" IS NOT NULL OR "requestedCheckOutAt" IS NOT NULL`,
)
export class AttendanceEditRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

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

  /** Null until approval creates the day this request was actually about. */
  @Column({ type: "uuid", nullable: true })
  attendanceId!: string | null;

  @ManyToOne(() => AttendanceDay, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "attendanceId" })
  attendance!: AttendanceDay | null;

  @Column({ type: "date" })
  workDate!: string;

  @Column({ type: "timestamptz", nullable: true })
  previousCheckInAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  previousCheckOutAt!: Date | null;

  /** What it should read after approval. Missing means "leave this end alone". */
  @Column({ type: "timestamptz", nullable: true })
  requestedCheckInAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  requestedCheckOutAt!: Date | null;

  /** Why. Required at the DTO layer — a correction with no reason is a guess. */
  @Column({ type: "varchar", length: 500 })
  reason!: string;

  @Column({ type: "varchar", length: 20, default: "PENDING" })
  status!: AttendanceEditRequestStatus;

  @Column({ type: "uuid" })
  requestedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "requestedBy" })
  requestedByUser!: User;

  @Column({ type: "uuid", nullable: true })
  decidedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "decidedBy" })
  decidedByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  decidedAt!: Date | null;

  /** The manager's own note — why approved, or why not. */
  @Column({ type: "varchar", length: 500, nullable: true })
  decisionNote!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
