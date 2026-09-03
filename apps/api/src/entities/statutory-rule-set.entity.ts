import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "./user.entity";

/** One band of Sri Lanka's progressive APIT table. `uptoCents: null` means "and above" — the last band. */
export interface ApitBand {
  uptoCents: number | null;
  ratePercent: number;
}

/**
 * A version of the platform-wide EPF/ETF/APIT rates — global, not
 * tenant-scoped, since these are facts about Sri Lankan law, not a
 * per-salon business policy. Configured by SUPER_ADMIN only
 * (`PLATFORM_ADMIN`, spec §21: "restricted to platform/authorized
 * compliance role"), the same way a commission plan is an owner's decision
 * but a statutory rate table is not.
 *
 * Effective-dated the same way `Employment` is — closing the previous
 * version and opening a new one, never edited in place, so a payroll run
 * finalized under an old rate table stays reproducible after IRD publishes
 * a new one (CLAUDE.md §7, root rule). Unlike `Employment`, "exactly one
 * open version at a time" is enforced in `StatutoryRuleSetService` rather
 * than a database constraint: this table is edited by trusted platform
 * staff a handful of times a year, not from a high-concurrency customer
 * path, so the DB-as-final-arbiter reasoning that gives Appointment its
 * exclusion constraint doesn't carry the same weight here.
 *
 * `verified` defaults `false` — a rule set existing at all does not mean a
 * qualified Sri Lankan payroll/accounting professional has confirmed it.
 * Nothing computes from a rule set for a given tenant unless that tenant's
 * own `Tenant.statutoryPayrollEnabled` is also `true` — two independent
 * gates, deliberately, so publishing a draft rule set for review can never
 * itself turn on real calculations for anyone (DECISIONS.md §65).
 */
@Entity("statutory_rule_set")
@Check("CHK_statutory_rule_set_percent_range", `
  "epfEmployeePercent" BETWEEN 0 AND 100
  AND "epfEmployerPercent" BETWEEN 0 AND 100
  AND "etfEmployerPercent" BETWEEN 0 AND 100
`)
@Check("CHK_statutory_rule_set_threshold_nonneg", `"apitMonthlyFreeThresholdCents" >= 0`)
@Check("CHK_statutory_rule_set_range_valid", `"effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"`)
export class StatutoryRuleSet {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "date" })
  effectiveFrom!: string;

  /** NULL = this is the currently open version — see the class doc. */
  @Column({ type: "date", nullable: true })
  effectiveTo!: string | null;

  @Column({ type: "int" })
  epfEmployeePercent!: number;

  @Column({ type: "int" })
  epfEmployerPercent!: number;

  @Column({ type: "int" })
  etfEmployerPercent!: number;

  /** Monthly income up to this amount owes no APIT at all, before the bands below apply to the remainder. */
  @Column({ type: "int" })
  apitMonthlyFreeThresholdCents!: number;

  /** Ordered ascending; the last entry's `uptoCents` should be `null` ("and above"). Validated in the service, not the database. */
  @Column({ type: "jsonb" })
  apitBands!: ApitBand[];

  /** Whether a qualified Sri Lankan payroll/accounting professional has confirmed this version before it was published. */
  @Column({ type: "boolean", default: false })
  verified!: boolean;

  /** Exact title, publication/effective date, and retrieval date of the official source(s) used — spec §31's own requirement. */
  @Column({ type: "text" })
  sourceNote!: string;

  @Column({ type: "uuid" })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
