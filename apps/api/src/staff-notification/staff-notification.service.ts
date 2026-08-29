import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, Repository } from "typeorm";
import { ApiError, BookingSource } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { StaffNotification } from "../entities/staff-notification.entity";
import { StaffNotificationRead } from "../entities/staff-notification-read.entity";
import { explainStaffNotification, type StaffNotificationFacts } from "./explain-staff-notification";

/**
 * The auto-decaying popup's threshold (DECISIONS.md): a live COUNT of a
 * tenant's `ONLINE` appointments compared to this constant, never a stored
 * counter — a counter could drift during unrelated data operations (the
 * salon-offboarding purge, for one) and self-heals nothing; a live count
 * is always consistent with reality.
 */
const POPUP_LIFETIME_BOOKING_THRESHOLD = 10;

export interface StaffNotificationView {
  id: string;
  type: string;
  appointmentId: string | null;
  title: string;
  body: string;
  createdAt: Date;
  read: boolean;
}

@Injectable()
export class StaffNotificationService {
  constructor(
    @InjectRepository(StaffNotification) private readonly notifications: Repository<StaffNotification>,
    @InjectRepository(StaffNotificationRead) private readonly reads: Repository<StaffNotificationRead>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
  ) {}

  /**
   * Called from the same three `booking.service.ts` call sites that already
   * audit `APPOINTMENT_CREATED`/`APPOINTMENT_CANCELLED`/
   * `APPOINTMENT_RESCHEDULED` for a customer-originated event — never a
   * second source of truth for "what happened", just a staff-facing
   * restatement of it.
   */
  async notify(tenantId: string, appointmentId: string | null, facts: StaffNotificationFacts): Promise<void> {
    const { title, body } = explainStaffNotification(facts);
    await this.notifications.save(
      this.notifications.create({ tenantId, type: facts.type, appointmentId, title, body }),
    );
  }

  /**
   * Polled every 20-30s by the admin bell (DECISIONS.md: polling, not
   * WebSockets — no real-time infra exists in this codebase, and Render's
   * free-tier services sleep after 15 minutes idle, which fights a
   * persistent connection). `latest` rides along so the frontend can show
   * the popup's content without a second request when `showPopup` is true
   * and the count has just increased.
   */
  async unreadStatus(
    tenantId: string,
    userId: string,
  ): Promise<{ count: number; showPopup: boolean; latest: StaffNotificationView | null }> {
    const unread = await this.notifications
      .createQueryBuilder("n")
      .leftJoin(StaffNotificationRead, "r", 'r."notificationId" = n.id AND r."userId" = :userId', { userId })
      .where("n.tenantId = :tenantId", { tenantId })
      .andWhere('r."notificationId" IS NULL')
      .orderBy("n.createdAt", "DESC")
      .getMany();

    const onlineBookings = await this.appointments.count({
      where: { tenantId, source: BookingSource.ONLINE },
    });

    return {
      count: unread.length,
      showPopup: onlineBookings < POPUP_LIFETIME_BOOKING_THRESHOLD,
      latest: unread[0] ? { ...unread[0], read: false } : null,
    };
  }

  async list(
    tenantId: string,
    userId: string,
    query: { limit: number; offset: number },
  ): Promise<{ data: StaffNotificationView[]; meta: { total: number; limit: number; offset: number } }> {
    const [rows, total] = await this.notifications.findAndCount({
      where: { tenantId },
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    if (rows.length === 0) {
      return { data: [], meta: { total, limit: query.limit, offset: query.offset } };
    }

    const readRows = await this.reads.find({
      where: { userId, notificationId: In(rows.map((r) => r.id)) },
    });
    const readIds = new Set(readRows.map((r) => r.notificationId));

    return {
      data: rows.map((r) => ({ ...r, read: readIds.has(r.id) })),
      meta: { total, limit: query.limit, offset: query.offset },
    };
  }

  async markRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
    const notification = await this.notifications.findOne({ where: { id: notificationId, tenantId } });
    if (!notification) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Notification not found." });
    }
    const existing = await this.reads.findOne({ where: { notificationId, userId } });
    if (!existing) {
      await this.reads.save(this.reads.create({ notificationId, userId, readAt: new Date() }));
    }
  }

  async markAllRead(tenantId: string, userId: string): Promise<void> {
    const rows = await this.notifications.find({ where: { tenantId }, select: { id: true } });
    if (rows.length === 0) {
      return;
    }
    const existing = await this.reads.find({
      where: { userId, notificationId: In(rows.map((r) => r.id)) },
    });
    const alreadyRead = new Set(existing.map((r) => r.notificationId));
    const toInsert = rows
      .filter((r) => !alreadyRead.has(r.id))
      .map((r) => this.reads.create({ notificationId: r.id, userId, readAt: new Date() }));
    if (toInsert.length > 0) {
      await this.reads.save(toInsert);
    }
  }
}
