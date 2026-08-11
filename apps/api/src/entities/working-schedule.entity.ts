import {
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

/** Weekly-recurring; a row's absence for a weekday = day off (DATABASE.md §2.2). */
@Entity("working_schedule")
@Index(["staffId", "dayOfWeek"], { unique: true })
export class WorkingSchedule {
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

  /** 0=Mon..6=Sun. */
  @Column({ type: "int" })
  dayOfWeek!: number;

  /** Minutes since midnight. */
  @Column({ type: "int" })
  startMin!: number;

  @Column({ type: "int" })
  endMin!: number;

  @Column({ type: "int", nullable: true })
  breakStartMin!: number | null;

  @Column({ type: "int", nullable: true })
  breakEndMin!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
