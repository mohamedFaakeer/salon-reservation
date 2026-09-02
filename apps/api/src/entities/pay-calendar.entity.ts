import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Tenant } from "./tenant.entity";

/**
 * A tenant's monthly pay-period cycle. One row per tenant, created lazily on
 * first write — a tenant with none configured gets the calendar-month default
 * (`monthlyAnchorDay: 1`) from `PayCalendarService.resolve`, the same
 * "resolve with a default" shape `resolveModules`/`resolveLimits` already use
 * for tenant entitlements, rather than every tenant needing a row from day one.
 *
 * Daily pay periods need no configuration at all — a day is a day — so there
 * is nothing here for that frequency; `payroll.domain.ts#resolvePayPeriod`
 * only reads this for MONTHLY.
 */
@Entity("pay_calendar")
@Check("CHK_pay_calendar_anchor_range", `"monthlyAnchorDay" BETWEEN 1 AND 28`)
export class PayCalendar {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", unique: true })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  /** Day of month a pay period starts, e.g. 1 for a calendar month, 21 for a 21st-to-20th cycle. Capped at 28 so every month has that day. */
  @Column({ type: "int", default: 1 })
  monthlyAnchorDay!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
