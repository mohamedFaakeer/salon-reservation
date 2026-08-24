import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Customer } from "./customer.entity";

@Entity("customer_notification_preferences")
@Index(["tenantId"])
@Unique(["customerId"])
export class CustomerNotificationPreferences {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "customerId", type: "uuid" })
  customerId: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: "customerId" })
  customer: Customer;

  @Column({ name: "emailOptIn", type: "boolean", default: true })
  emailOptIn: boolean;

  @Column({ name: "smsOptIn", type: "boolean", default: true })
  smsOptIn: boolean;

  @Column({ name: "whatsappOptIn", type: "boolean", default: true })
  whatsappOptIn: boolean;

  @Column({ name: "consoleOptIn", type: "boolean", default: true })
  consoleOptIn: boolean;

  @Column({ name: "marketingOptIn", type: "boolean", default: false })
  marketingOptIn: boolean;

  @Column({ name: "quietHoursStart", type: "time", nullable: true })
  quietHoursStart: string | null;

  @Column({ name: "quietHoursEnd", type: "time", nullable: true })
  quietHoursEnd: string | null;

  @Column({ name: "timezone", type: "varchar", length: 50, default: "UTC" })
  timezone: string;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}