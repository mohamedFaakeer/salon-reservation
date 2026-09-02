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
import type { PayFrequency } from "@salon/shared";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * How a staff member is paid, effective-dated — the payroll spec's own rule
 * that a compensation change is never overwritten, only superseded. Exactly
 * one row per staff member has `effectiveTo IS NULL` at any time (enforced by
 * `UQ_employment_staff_open`): that is the row currently in force, or —if its
 * `effectiveFrom` is still in the future — the one about to take over. The
 * row it replaced gets its own `effectiveTo` closed off in the same
 * transaction that opens this one (`EmploymentService.supersede`), so the
 * chain for one staff member always tiles the calendar with no gaps and no
 * overlaps: `effectiveFrom <= date <= (effectiveTo ?? infinity)` finds the
 * version that applied on any given date, past or future.
 *
 * Deliberately its own entity rather than new columns on `Staff` (approved
 * plan, "Employment model" decision): `Staff` is identity — name, specialty,
 * calendar color — read by booking/attendance/incentives throughout the app,
 * none of which need to know or care how someone is paid. EPF/ETF
 * eligibility, bank details, and every other field the full spec eventually
 * needs are deliberately not here yet — Phase 1 only carries what Phase 2's
 * base-pay calculation needs to consume; each later phase adds its own
 * fields as a new version, the same way the row itself versions over time.
 */
@Entity("employment")
@Index(["tenantId", "staffId"])
@Index(["staffId"], { unique: true, where: '"effectiveTo" IS NULL' })
@Check("CHK_employment_rate_nonneg", `"baseRateCents" >= 0`)
@Check("CHK_employment_range_valid", `"effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"`)
export class Employment {
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

  @Column({ type: "varchar", length: 10 })
  payFrequency!: PayFrequency;

  /** Monthly salary if `payFrequency` is MONTHLY, daily wage if DAILY. */
  @Column({ type: "int" })
  baseRateCents!: number;

  @Column({ type: "date" })
  effectiveFrom!: string;

  /** NULL = this is the currently open version — see the class doc. */
  @Column({ type: "date", nullable: true })
  effectiveTo!: string | null;

  /** The version this one replaced, kept for a visible history — never edited, never deleted. */
  @Column({ type: "uuid", nullable: true })
  supersedesEmploymentId!: string | null;

  @ManyToOne(() => Employment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "supersedesEmploymentId" })
  supersedesEmployment!: Employment | null;

  @Column({ type: "uuid" })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
