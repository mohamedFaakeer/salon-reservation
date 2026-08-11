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

  @Column({ type: "uuid" })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "createdBy" })
  createdByUser!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
