import {
  Check,
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
import { Service } from "./service.entity";
import { Tenant } from "./tenant.entity";

/**
 * How a stylist earns, beyond a wage. Three components, each optional, that
 * compose rather than replace one another:
 *
 *   - a base commission (percent of what was actually collected for their
 *     work — see `revenue means received` in incentive.domain.ts);
 *   - named-service overrides on `IncentivePlanServiceRate`, e.g. a richer
 *     rate on colouring than on a trim;
 *   - a flat amount per job performed, for a plan that wants to reward
 *     volume rather than ticket size;
 *   - a monthly-target tier bonus: a percent on whatever is collected past a
 *     threshold.
 *
 * `CHK_incentive_plan_has_component` refuses a plan with none of the four —
 * that is a configuration mistake, not a valid plan, and the database is
 * where that gets caught rather than in a payout nobody double-checked.
 */
@Entity("incentive_plan")
@Index(["tenantId"])
@Check(
  "CHK_incentive_plan_has_component",
  `"baseCommissionPercent" IS NOT NULL
   OR "perJobAmountCents" IS NOT NULL
   OR ("monthlyTargetCents" IS NOT NULL AND "tierBonusPercent" IS NOT NULL)`,
)
@Check(
  "CHK_incentive_plan_tier_paired",
  `("monthlyTargetCents" IS NULL) = ("tierBonusPercent" IS NULL)`,
)
export class IncentivePlan {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 80 })
  name!: string;

  /** Whole percent, 0-100. Applies to every service with no rate of its own. */
  @Column({ type: "int", nullable: true })
  baseCommissionPercent!: number | null;

  @Column({ type: "int", nullable: true })
  perJobAmountCents!: number | null;

  /** Both this and `tierBonusPercent` are set together, or neither is. */
  @Column({ type: "int", nullable: true })
  monthlyTargetCents!: number | null;

  @Column({ type: "int", nullable: true })
  tierBonusPercent!: number | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @OneToMany(() => IncentivePlanServiceRate, (rate) => rate.plan)
  serviceRates!: IncentivePlanServiceRate[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

/**
 * One service's own rate, replacing the plan's base commission for it.
 * `UQ_incentive_rate_plan_service` — a service names at most one rate per
 * plan; a second row for the same pair is an edit, not a new fact.
 */
@Entity("incentive_plan_service_rate")
@Index(["planId", "serviceId"], { unique: true })
export class IncentivePlanServiceRate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  planId!: string;

  @ManyToOne(() => IncentivePlan, (plan) => plan.serviceRates, { onDelete: "CASCADE" })
  @JoinColumn({ name: "planId" })
  plan!: IncentivePlan;

  @Column({ type: "uuid" })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: "CASCADE" })
  @JoinColumn({ name: "serviceId" })
  service!: Service;

  @Column({ type: "int" })
  ratePercent!: number;
}
