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
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * One staff member's one day.
 *
 * A row exists only once somebody has punched. Absence is therefore the
 * *absence* of a row, worked out at read time against the rota — which means
 * no nightly job has to invent ABSENT rows for everyone who did not turn up,
 * and no cron can quietly stop running and leave a month looking perfect.
 *
 * The expectation is snapshotted, not looked up. Lateness is a comparison
 * against a rostered start, so computing it live would mean that editing
 * somebody's rota next March silently rewrites whether they were late last
 * August. CLAUDE.md rule §5 already forbids that shape of thing for prices,
 * and pay disputes are a worse place to discover it than invoices.
 */
@Entity("attendance_day")
@Index(["tenantId", "workDate"])
@Index(["staffId", "workDate"], { unique: true })
@Check("CHK_attendance_out_after_in", `"checkOutAt" IS NULL OR "checkOutAt" > "checkInAt"`)
@Check("CHK_attendance_minutes", `"lateMinutes" >= 0 AND "earlyMinutes" >= 0`)
export class AttendanceDay {
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

  /** Colombo-local calendar date, not a timestamp — a shift belongs to a day. */
  @Column({ type: "date" })
  workDate!: string;

  @Column({ type: "timestamptz" })
  checkInAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  checkOutAt!: Date | null;

  /**
   * Who pressed it. Not the same as who it was for: the front desk punches in
   * stylists who have no login of their own, and "she says she was here at
   * nine, the desk recorded it at nine-twenty" is a conversation that needs
   * this column to be had at all.
   */
  @Column({ type: "uuid", nullable: true })
  checkInBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "checkInBy" })
  checkInByUser!: User | null;

  @Column({ type: "uuid", nullable: true })
  checkOutBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "checkOutBy" })
  checkOutByUser!: User | null;

  /**
   * The rostered shift as it stood when the day was recorded, in minutes since
   * local midnight. Null means there was no rota for that weekday — somebody
   * came in on their day off, which is a fact worth keeping and not a
   * lateness to measure.
   */
  @Column({ type: "int", nullable: true })
  expectedStartMin!: number | null;

  @Column({ type: "int", nullable: true })
  expectedEndMin!: number | null;

  /** The tenant's grace settings as they stood that day, for the same reason. */
  @Column({ type: "int", default: 0 })
  graceMinutes!: number;

  @Column({ type: "int", default: 0 })
  earlyGraceMinutes!: number;

  /**
   * Derived from the columns above, but stored so reports can sum lateness in
   * SQL rather than pulling a month of rows into memory to add them up. Every
   * write goes through the same pure function, so the two cannot drift.
   */
  @Column({ type: "int", default: 0 })
  lateMinutes!: number;

  @Column({ type: "int", default: 0 })
  earlyMinutes!: number;

  /** Null until they check out. */
  @Column({ type: "int", nullable: true })
  workedMinutes!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
