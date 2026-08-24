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
import { NotificationEvent } from "@salon/shared";

@Entity("notification_template")
@Index(["tenantId"])
@Index(["channel"])
@Index(["isSystem"])
@Index(["eventType"])
export class NotificationTemplate {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "name", type: "varchar", length: 160 })
  name: string;

  @Column({ name: "eventType", type: "varchar", length: 50 })
  eventType: NotificationEvent;

  @Column({ name: "subject", type: "text", nullable: true })
  subject: string | null;

  @Column({ name: "body", type: "text" })
  body: string;

  @Column({
    name: "channel",
    type: "varchar",
    length: 10,
  })
  channel: "console" | "email" | "sms" | "whatsapp";

  @Column({ name: "variables", type: "jsonb", default: "[]" })
  variables: string[];

  @Column({ name: "isSystem", type: "boolean", default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}
