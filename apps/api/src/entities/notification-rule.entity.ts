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

@Entity("notification_rule")
@Index(["tenantId"])
@Index(["isEnabled"])
@Index(["priority"])
export class NotificationRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "name", type: "varchar", length: 160 })
  name: string;

  @Column({ name: "timingType", type: "varchar", length: 30 })
  timingType: "BEFORE_APPT" | "DAY_OF_APPT" | "AFTER_BOOKING" | "AFTER_COMPLETION";

  @Column({ name: "timingValue", type: "jsonb" })
  timingValue: Record<string, unknown>;

  @Column({ name: "channels", type: "text", array: true })
  channels: ("console" | "email" | "sms" | "whatsapp")[];

  @Column({ name: "templateSubject", type: "text", nullable: true })
  templateSubject: string | null;

  @Column({ name: "templateBody", type: "text" })
  templateBody: string;

  @Column({ name: "targeting", type: "jsonb", default: "{}" })
  targeting: Record<string, unknown>;

  @Column({ name: "isEnabled", type: "boolean", default: true })
  isEnabled: boolean;

  @Column({ name: "priority", type: "int", default: 0 })
  priority: number;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}