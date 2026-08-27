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
import type { NotificationEvent } from "@salon/shared";

/**
 * A per-tenant, per-event kill switch — "don't send Cancellation
 * Confirmation messages at all", independent of channel or which Rule/
 * Template would otherwise render one (DECISIONS.md §40). Deliberately not
 * the same concept as `NotificationTemplate.isEnabled` (§39.4), which only
 * affects the one, currently-unreached, system-template fallback path: this
 * gate is checked before *any* dispatch for the event, hardcoded lifecycle
 * `fire()` calls included. Absence of a row means enabled — so a brand new
 * `NotificationEvent` added later needs no backfill to default "on".
 */
@Entity("notification_event_setting")
@Index(["tenantId"])
@Unique(["tenantId", "eventType"])
export class NotificationEventSetting {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenantId", type: "uuid" })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant: Tenant;

  @Column({ name: "eventType", type: "varchar", length: 50 })
  eventType: NotificationEvent;

  @Column({ name: "isEnabled", type: "boolean", default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: "createdAt", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updatedAt", type: "timestamptz" })
  updatedAt: Date;
}
