import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Per-user read state for a `StaffNotification` — a companion table, same
 * reasoning `SecurityEventReview` already uses for `AuditLog`: the fact
 * being described stays immutable, and "who has seen this" is a separate,
 * mutable concern with a different owner (the reading staff member, not
 * whoever wrote the event). One row per (notification, user) that has read
 * it; absence means unread — this state needs no third value, so it isn't
 * a boolean column on a row shared by every viewer.
 *
 * No FK: `staff_notification` rows are never deleted in the ordinary course
 * of things (they're pruned, if ever, on a simple age-based sweep this
 * plan explicitly left as a later nice-to-have, not wired to cascade
 * behavior), so a plain composite key avoids coupling this table's
 * lifecycle to that decision either way.
 */
@Entity("staff_notification_read")
export class StaffNotificationRead {
  @PrimaryColumn({ type: "uuid" })
  notificationId!: string;

  @PrimaryColumn({ type: "uuid" })
  userId!: string;

  @Column({ type: "timestamptz" })
  readAt!: Date;
}
