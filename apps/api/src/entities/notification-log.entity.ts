import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { NotificationRule } from "./notification-rule.entity";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";

@Entity("notification_log")
@Index(["tenantId"])
@Index(["status"])
@Index(["scheduledFor"])
@Index(["appointmentId"])
@Index(["ruleId"])
export class NotificationLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "ruleId", type: "uuid", nullable: true })
  ruleId: string | null;

  @ManyToOne(() => NotificationRule, { nullable: true })
  @JoinColumn({ name: "ruleId" })
  rule: NotificationRule | null;

  @Column({ name: "appointmentId", type: "uuid", nullable: true })
  appointmentId: string | null;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: "appointmentId" })
  appointment: Appointment | null;

  @Column({ name: "customerId", type: "uuid", nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: "customerId" })
  customer: Customer | null;

  @Column({
    name: "channel",
    type: "varchar",
    length: 10,
  })
  channel: "console" | "email" | "sms" | "whatsapp";

  @Column({
    name: "status",
    type: "varchar",
    length: 10,
    default: "PENDING",
  })
  status: "PENDING" | "SENT" | "FAILED" | "BOUNCED";

  @Column({ name: "providerMessageId", type: "varchar", length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ name: "errorMessage", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "scheduledFor", type: "timestamptz" })
  scheduledFor: Date;

  @Column({ name: "sentAt", type: "timestamptz", nullable: true })
  sentAt: Date | null;

  @Column({ name: "retryCount", type: "int", default: 0 })
  retryCount: number;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}