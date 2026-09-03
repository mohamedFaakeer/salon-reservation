import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import type { PayrollRunStatus } from "@salon/shared";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/** One allowance/deduction as applied to a frozen line — see `EmployeePayComponent` for the live, editable version this was copied from. */
export interface PayrollRunLineComponent {
  type: string;
  kind: "ALLOWANCE" | "DEDUCTION";
  amountCents: number;
  epfApplicable: boolean;
  etfApplicable: boolean;
}

/** One staff member's line within a run — frozen at submit time, the same "as applied" reasoning `IncentivePayout.snapshot` uses. */
export interface PayrollRunLine {
  staffId: string;
  staffName: string;
  payFrequency: string;
  basePayCents: number;
  unpaidAbsenceDays: number;
  unresolvedClosureDays: number;
  incentiveCents: number;
  incentiveSource: "FINALIZED_PAYOUT" | "LIVE_ESTIMATE" | null;
  payComponents: PayrollRunLineComponent[];
  allowancesCents: number;
  deductionsCents: number;
  grossCents: number;
  statutory: {
    epfEmployeeCents: number;
    epfEmployerCents: number;
    etfEmployerCents: number;
    apitCents: number;
    verified: boolean;
  } | null;
  netCents: number;
}

/**
 * A payroll run for one tenant, one period, every staff member with an
 * employment profile at once — the maker-checker unit spec §13 describes,
 * not a per-staff document like `IncentivePayout`. `snapshot` holds the
 * frozen per-staff lines (`PayrollRunLine[]`); `totalGrossCents`/
 * `totalNetCents`/`staffCount` are duplicated out as real columns purely so
 * a run list can sort/filter without deserializing jsonb, the same reason
 * `Invoice` duplicates its own totals out of its snapshot.
 *
 * Statutory figures only ever appear in a line when the run's period is
 * exactly one calendar month (APIT has no other kind — DECISIONS.md §62)
 * and the tenant has both Payroll's statutory engine enabled and a
 * published rule set; otherwise `statutory` is `null` on every line, not a
 * silently wrong number.
 *
 * `UQ_payroll_run_live_period` allows only one non-VOID run per tenant per
 * exact period — the same supersede-not-edit shape `incentive_payout`
 * already uses: correcting a run voids it and submits a fresh one, never
 * edits history in place.
 */
@Entity("payroll_run")
@Index(["tenantId"])
@Index(["tenantId", "periodStart", "periodEnd"], { unique: true, where: `"status" <> 'VOID'` })
@Check("CHK_payroll_run_range_valid", `"periodEnd" >= "periodStart"`)
@Check(
  "CHK_payroll_run_void_has_reason",
  `("status" <> 'VOID') OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)`,
)
@Check("CHK_payroll_run_approved_has_timestamp", `("status" = 'SUBMITTED') OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL)`)
@Check(
  "CHK_payroll_run_paid_has_timestamp",
  `("status" <> 'PAID') OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL AND "paymentMethod" IS NOT NULL)`,
)
export class PayrollRun {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "date" })
  periodStart!: string;

  @Column({ type: "date" })
  periodEnd!: string;

  @Column({ type: "varchar", length: 20, default: "SUBMITTED" })
  status!: PayrollRunStatus;

  @Column({ type: "int" })
  staffCount!: number;

  @Column({ type: "int" })
  totalGrossCents!: number;

  @Column({ type: "int" })
  totalNetCents!: number;

  @Column({ type: "jsonb" })
  snapshot!: PayrollRunLine[];

  @Column({ type: "uuid" })
  submittedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "submittedBy" })
  submittedByUser!: User;

  @Column({ type: "uuid", nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "approvedBy" })
  approvedByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  paidBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "paidBy" })
  paidByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  /** How the money actually moved. Set together with `paidAt`/`paidBy`, never before. */
  @Column({ type: "varchar", length: 20, nullable: true })
  paymentMethod!: string | null;

  /** A bank batch reference, or a free-text cash acknowledgement note — whatever the person marking this paid typed. */
  @Column({ type: "varchar", length: 255, nullable: true })
  paymentReference!: string | null;

  @Column({ type: "uuid", nullable: true })
  voidedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "voidedBy" })
  voidedByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  voidedAt!: Date | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  voidReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
