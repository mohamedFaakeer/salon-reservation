import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export const STAFF_NOTIFICATION_TYPES = [
  "APPOINTMENT_CREATED_ONLINE",
  "APPOINTMENT_CANCELLED_SELF",
  "APPOINTMENT_RESCHEDULED_SELF",
] as const;
export type StaffNotificationType = (typeof STAFF_NOTIFICATION_TYPES)[number];

/**
 * A customer-originated booking event, surfaced to staff (the notification
 * bell) — created alongside the matching `AuditLog` entry at the same three
 * call sites in `booking.service.ts`, never a second source of truth for
 * "what happened" (that stays `AuditLog`'s job). This table exists only
 * because `AuditLog` has no per-user read state and was never meant to be
 * polled by a UI badge.
 *
 * `title`/`body` are pre-rendered plain language (`explainStaffNotification`)
 * at write time, not re-derived at read time — unlike the monitoring
 * feature's severity, there is no "the rule changed" reason to recompute
 * this later, and a stored sentence survives even if the underlying
 * appointment is later purged (salon offboarding) or its customer
 * anonymized.
 *
 * No FK to `Appointment`: same reasoning `ErrorLog` already documents for
 * itself — this table must never be the reason a tenant's data can't be
 * purged or an appointment row treated normally.
 */
@Entity("staff_notification")
@Index(["tenantId", "createdAt"])
export class StaffNotification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @Column({ type: "varchar", length: 40 })
  type!: StaffNotificationType;

  @Column({ type: "uuid", nullable: true })
  appointmentId!: string | null;

  @Column({ type: "varchar", length: 160 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
