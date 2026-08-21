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
import type { IncentivePayoutStatus } from "@salon/shared";
import { IncentivePlan } from "./incentive-plan.entity";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * What a stylist was actually paid for one period — frozen, the way an
 * invoice freezes a bill. The live preview (`IncentiveService.preview`) can
 * move as later data changes; the moment someone finalises it, this row
 * stops moving.
 *
 * `planId` is kept for reference, but `snapshot` is the real record: the
 * plan's components *as applied* and every contributing line, so a payout
 * opened next year still explains itself even if the plan has since changed
 * or been deleted (hence `ON DELETE SET NULL`, never CASCADE — deleting a
 * plan must not be able to erase what it once paid).
 *
 * Corrections supersede rather than edit in place, same reasoning as
 * invoices: `UQ_incentive_payout_live_period` allows only one non-VOID row
 * per staff member per period, so voiding the old one is what makes room for
 * the new one, not an implementation detail.
 */
@Entity("incentive_payout")
@Index(["tenantId", "staffId"])
@Index(["staffId", "periodStart", "periodEnd"], { unique: true, where: `"status" <> 'VOID'` })
@Check("CHK_incentive_payout_total", `"totalCents" = "commissionCents" + "perJobCents" + "tierBonusCents"`)
@Check(
  "CHK_incentive_payout_paid_has_timestamp",
  `("status" <> 'PAID') OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL)`,
)
@Check(
  "CHK_incentive_payout_void_has_reason",
  `("status" <> 'VOID') OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)`,
)
export class IncentivePayout {
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

  @Column({ type: "uuid", nullable: true })
  planId!: string | null;

  @ManyToOne(() => IncentivePlan, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "planId" })
  plan!: IncentivePlan | null;

  @Column({ type: "date" })
  periodStart!: string;

  @Column({ type: "date" })
  periodEnd!: string;

  @Column({ type: "varchar", length: 20, default: "FINALISED" })
  status!: IncentivePayoutStatus;

  @Column({ type: "int" })
  revenueCents!: number;

  @Column({ type: "int" })
  commissionCents!: number;

  @Column({ type: "int" })
  jobsCompleted!: number;

  @Column({ type: "int" })
  perJobCents!: number;

  @Column({ type: "int" })
  tierBonusCents!: number;

  @Column({ type: "int" })
  totalCents!: number;

  /** The plan's components as applied, and every line that contributed. */
  @Column({ type: "jsonb" })
  snapshot!: unknown;

  @Column({ type: "uuid", nullable: true })
  supersedesPayoutId!: string | null;

  @Column({ type: "uuid" })
  finalisedBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "finalisedBy" })
  finalisedByUser!: User;

  @Column({ type: "timestamptz", nullable: true })
  paidAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  paidBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "paidBy" })
  paidByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  voidedAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  voidedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "voidedBy" })
  voidedByUser!: User | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  voidReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
