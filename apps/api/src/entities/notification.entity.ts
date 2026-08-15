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
import { NotificationStatus, type NotificationChannel, type NotificationEvent } from "@salon/shared";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";
import { Tenant } from "./tenant.entity";

/**
 * A delivery record per appointment/channel (DATABASE.md §2.6). Both FKs are
 * SET NULL, never CASCADE — a notification's delivery history must outlive
 * the appointment it was sent about (CLAUDE.md: no hard deletes on business
 * records).
 */
@Entity("notification")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Index()
  @Column({ type: "uuid", nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => Appointment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment | null;

  @Column({ type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "customerId" })
  customer!: Customer | null;

  @Column({ type: "varchar", length: 30 })
  type!: NotificationEvent;

  @Column({ type: "varchar", length: 10 })
  channel!: NotificationChannel;

  @Column({ type: "varchar", length: 255 })
  recipient!: string;

  @Index()
  @Column({ type: "varchar", length: 10, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Column({ type: "int", default: 0 })
  retryCount!: number;

  @Column({ type: "timestamptz", nullable: true })
  nextRetryAt!: Date | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  lastError!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  providerMessageId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
