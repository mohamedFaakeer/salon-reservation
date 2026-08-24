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

@Entity("notification_quota")
@Index(["tenantId"])
@Index(["month"])
@Unique(["tenantId", "month"])
export class NotificationQuota {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "month", type: "varchar", length: 7 })
  month: string;

  @Column({ name: "emailSent", type: "int", default: 0 })
  emailSent: number;

  @Column({ name: "smsSent", type: "int", default: 0 })
  smsSent: number;

  @Column({ name: "whatsappSent", type: "int", default: 0 })
  whatsappSent: number;

  @Column({ name: "consoleSent", type: "int", default: 0 })
  consoleSent: number;

  @Column({ name: "emailLimit", type: "int", default: 1000 })
  emailLimit: number;

  @Column({ name: "smsLimit", type: "int", default: 500 })
  smsLimit: number;

  @Column({ name: "whatsappLimit", type: "int", default: 500 })
  whatsappLimit: number;

  @Column({ name: "consoleLimit", type: "int", default: 5000 })
  consoleLimit: number;

  @Column({ name: "alertedAt", type: "timestamptz", nullable: true })
  alertedAt: Date | null;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}