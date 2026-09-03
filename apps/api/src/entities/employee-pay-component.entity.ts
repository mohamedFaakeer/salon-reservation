import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { PayComponentType } from "@salon/shared";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * A recurring allowance or deduction assigned to one staff member, from the
 * fixed list in `PayComponentType` (DECISIONS.md §69) — not effective-dated
 * like `Employment`: an allowance amount changing isn't the same kind of
 * record-worthy event a wage change is, and `PayrollRun.snapshot` already
 * preserves whatever was actually applied to a finalized period regardless
 * of later edits here. Deactivating (never deleting, CLAUDE.md §8) is how a
 * component stops applying to future runs.
 *
 * `epfApplicable`/`etfApplicable` default `false` — whether a given
 * allowance counts toward EPF/ETF is a real legal question this project
 * isn't positioned to assert by default (the same caution the statutory
 * engine itself uses); an owner opts in explicitly per assignment.
 *
 * `UQ_employee_pay_component_active` allows only one active row per staff
 * member per type — assigning "Transport allowance" again replaces the
 * existing one rather than creating a second.
 */
@Entity("employee_pay_component")
@Index(["tenantId", "staffId"])
@Index(["staffId", "type"], { unique: true, where: `"active" = true` })
@Check("CHK_employee_pay_component_amount_nonneg", `"amountCents" >= 0`)
@Check(
  "CHK_employee_pay_component_other_has_reason",
  `"type" <> 'OTHER_DEDUCTION' OR "reason" IS NOT NULL`,
)
export class EmployeePayComponent {
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

  @Column({ type: "varchar", length: 40 })
  type!: PayComponentType;

  @Column({ type: "int" })
  amountCents!: number;

  @Column({ type: "boolean", default: false })
  epfApplicable!: boolean;

  @Column({ type: "boolean", default: false })
  etfApplicable!: boolean;

  /** Required when `type` is `OTHER_DEDUCTION`; unused for every other type. */
  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "uuid" })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
