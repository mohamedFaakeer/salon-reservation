import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * Overlapping leave rows for the same staff member are allowed — the
 * availability engine (P9) treats any overlap as unavailable
 * (DATABASE.md §2.2). No soft-delete column — removal is a hard DELETE.
 */
@Entity("staff_leave")
export class StaffLeave {
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

  @Column({ type: "date" })
  startDate!: string;

  @Column({ type: "date" })
  endDate!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  /**
   * Whether this leave is paid — added for the Payroll module (DECISIONS.md
   * §62 Phase 2), which needs to know before it can treat an ON_LEAVE day as
   * earning pay or not. Defaults `true` (and every row created before this
   * column existed was backfilled `true`) so existing behaviour doesn't
   * silently change: nothing was ever being docked for leave before Payroll
   * existed, and this column only starts mattering once Payroll reads it.
   * There is no admin UI to set this to `false` yet — that's its own
   * mockup-approved screen change, not bundled into this backend addition.
   */
  @Column({ type: "boolean", default: true })
  paid!: boolean;

  @Column({ type: "uuid" })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
