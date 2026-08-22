import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, In, LessThanOrEqual, Repository } from "typeorm";
import { AppointmentStatus, ApiError, NotificationChannel, NotificationEvent, NotificationStatus } from "@salon/shared";
import type { NotificationQueryDto } from "@salon/shared";
import { Notification } from "../entities/notification.entity";
import { Appointment } from "../entities/appointment.entity";
import type { Customer } from "../entities/customer.entity";
import { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationProviderResolver } from "./providers/resolve-notification-provider";

/** Fixed backoff, minutes after each failed attempt; index = retryCount - 1. Exhausted → FAILED permanently (manual retry still available). */
const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60];

/** How far past a reminder cron tick a candidate window reaches — a little wider than the 15-min tick interval so nothing slips through; the per-appointment dedup check (below) absorbs the resulting overlap. */
const REMINDER_SCAN_WINDOW_MINUTES = 20;

export interface NotificationListResult {
  data: Notification[];
  meta: { total: number; limit: number; offset: number };
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly providers: NotificationProviderResolver,
  ) {}

  /**
   * The one place `Notification` rows are created. Always fires a `CONSOLE`
   * row (Decision Q4's guaranteed-offline channel); fires an `EMAIL` row too
   * only if the customer has an email on file. Never throws — a delivery
   * failure is captured on the row, not propagated to the caller (PRD §3.10:
   * "notification failure never cancels or alters an appointment").
   */
  async fire(tenant: Tenant, event: NotificationEvent, appointment: Appointment, customer: Customer): Promise<void> {
    await this.recordAndSend(tenant.id, event, NotificationChannel.CONSOLE, customer.phone, appointment, customer);
    if (customer.email) {
      await this.recordAndSend(tenant.id, event, NotificationChannel.EMAIL, customer.email, appointment, customer);
    }
  }

  /**
   * A staff-triggered message with no `Appointment` behind it and
   * caller-supplied text, unlike every other event `buildMessage()` derives
   * from a stored appointment. Same "always CONSOLE, plus EMAIL if the
   * customer has one, never throws" shape as `fire()`. The text is persisted
   * on the row (`body`) so a later manual retry can still send the exact
   * message rather than falling back to a generic one.
   */
  async sendCampaignMessage(tenant: Tenant, customer: Customer, message: string): Promise<Notification[]> {
    const sent = [
      await this.recordCampaignAndSend(tenant.id, customer, NotificationChannel.CONSOLE, customer.phone, message),
    ];
    if (customer.email) {
      sent.push(
        await this.recordCampaignAndSend(tenant.id, customer, NotificationChannel.EMAIL, customer.email, message),
      );
    }
    return sent;
  }

  /** POST /notifications/:id/retry — attempts delivery again immediately, regardless of `nextRetryAt`. */
  async retry(tenantId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id: notificationId, tenantId } });
    if (!notification) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Notification not found." });
    }
    return this.attemptDelivery(notification);
  }

  /** GET /notifications */
  async list(tenantId: string, query: NotificationQueryDto): Promise<NotificationListResult> {
    const where: Record<string, unknown> = { tenantId };
    if (query.appointmentId) {
      where.appointmentId = query.appointmentId;
    }
    if (query.status) {
      where.status = query.status;
    }
    const [data, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  /** Cron: every minute, attempts every notification whose backoff window has elapsed. */
  async runScheduledRetries(): Promise<void> {
    const due = await this.notifications.find({
      where: { status: NotificationStatus.PENDING, nextRetryAt: LessThanOrEqual(new Date()) },
    });
    for (const notification of due) {
      await this.attemptDelivery(notification);
    }
  }

  /** Cron: every 15 min, fires REMINDER_24H/REMINDER_2H for appointments entering each configured offset's window. */
  async runReminderScan(): Promise<void> {
    const tenants = await this.tenantRepo.find({ where: { status: TenantStatus.ACTIVE } });
    for (const tenant of tenants) {
      if (tenant.settings.reminderOffsets.includes(24)) {
        await this.scanAndFireReminders(tenant, 24, NotificationEvent.REMINDER_24H);
      }
      if (tenant.settings.reminderOffsets.includes(2)) {
        await this.scanAndFireReminders(tenant, 2, NotificationEvent.REMINDER_2H);
      }
    }
  }

  private async scanAndFireReminders(
    tenant: Tenant,
    offsetHours: number,
    event: NotificationEvent,
  ): Promise<void> {
    const windowStart = new Date(Date.now() + offsetHours * 60 * 60_000);
    const windowEnd = new Date(windowStart.getTime() + REMINDER_SCAN_WINDOW_MINUTES * 60_000);
    const candidates = await this.appointments.find({
      where: {
        tenantId: tenant.id,
        status: In([AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN]),
        startTime: Between(windowStart, windowEnd),
      },
      relations: { customer: true },
    });
    for (const appointment of candidates) {
      const alreadySent = await this.notifications.findOne({ where: { appointmentId: appointment.id, type: event } });
      if (alreadySent) {
        continue;
      }
      await this.fire(tenant, event, appointment, appointment.customer);
    }
  }

  private async recordAndSend(
    tenantId: string,
    type: NotificationEvent,
    channel: NotificationChannel,
    recipient: string,
    appointment: Appointment,
    customer: Customer,
  ): Promise<void> {
    const notification = await this.notifications.save(
      this.notifications.create({
        tenantId,
        appointmentId: appointment.id,
        customerId: customer.id,
        type,
        channel,
        recipient,
        status: NotificationStatus.PENDING,
        retryCount: 0,
      }),
    );
    await this.attemptDelivery(notification);
  }

  private async recordCampaignAndSend(
    tenantId: string,
    customer: Customer,
    channel: NotificationChannel,
    recipient: string,
    body: string,
  ): Promise<Notification> {
    const notification = await this.notifications.save(
      this.notifications.create({
        tenantId,
        appointmentId: null,
        customerId: customer.id,
        type: NotificationEvent.WINBACK_OFFER,
        channel,
        recipient,
        body,
        status: NotificationStatus.PENDING,
        retryCount: 0,
      }),
    );
    return this.attemptDelivery(notification);
  }

  private async attemptDelivery(notification: Notification): Promise<Notification> {
    const provider = this.providers.resolve(notification.channel);
    const { subject, body } = await this.buildMessage(notification);

    try {
      const result = await provider.send({ recipient: notification.recipient, subject, body });
      notification.status = NotificationStatus.SENT;
      notification.providerMessageId = result.providerMessageId;
      notification.lastError = null;
      notification.nextRetryAt = null;
    } catch (err) {
      notification.retryCount += 1;
      notification.lastError = err instanceof Error ? err.message : "Unknown delivery error.";
      const delayMinutes = RETRY_BACKOFF_MINUTES[notification.retryCount - 1];
      if (delayMinutes === undefined) {
        notification.status = NotificationStatus.FAILED;
        notification.nextRetryAt = null;
      } else {
        notification.status = NotificationStatus.PENDING;
        notification.nextRetryAt = new Date(Date.now() + delayMinutes * 60_000);
      }
    }

    return this.notifications.save(notification);
  }

  /**
   * Rebuilt from the notification's own stored fields, not captured at
   * `fire()` time — the schema has no `subject`/`body` columns (DATABASE.md
   * §2.6), so a retry (possibly minutes or hours later) must regenerate the
   * message from a fresh read, not replay stale in-memory text.
   */
  private async buildMessage(notification: Notification): Promise<{ subject: string; body: string }> {
    // Campaign messages (WINBACK_OFFER) persist their exact text on the row
    // itself — there's no appointment to rebuild it from.
    if (notification.body) {
      return { subject: "A message from your salon", body: notification.body };
    }
    if (!notification.appointmentId) {
      return { subject: "Salon notification", body: "You have a notification from your salon." };
    }
    const appointment = await this.appointments.findOne({
      where: { id: notification.appointmentId },
      relations: { staff: true },
    });
    if (!appointment) {
      return { subject: "Salon notification", body: "You have a notification from your salon." };
    }

    const when = appointment.startTime.toLocaleString("en-LK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Colombo",
    });
    const ref = appointment.bookingReference;
    const staffName = appointment.staff.name;

    switch (notification.type) {
      case NotificationEvent.BOOKING_CONFIRMATION:
        return {
          subject: `Booking confirmed — ${ref}`,
          body: `Your appointment on ${when} with ${staffName} is confirmed. Reference: ${ref}.`,
        };
      case NotificationEvent.PAYMENT_CONFIRMATION:
        return {
          subject: `Payment received — ${ref}`,
          body: `We've recorded your payment for appointment ${ref} on ${when}.`,
        };
      case NotificationEvent.REMINDER_24H:
        return {
          subject: `Reminder: tomorrow with ${staffName}`,
          body: `Reminder: your appointment is on ${when} with ${staffName}. Reference: ${ref}.`,
        };
      case NotificationEvent.REMINDER_2H:
        return {
          subject: `Reminder: coming up soon`,
          body: `Reminder: your appointment is at ${when} with ${staffName}, coming up soon. Reference: ${ref}.`,
        };
      case NotificationEvent.CANCELLATION_CONFIRMATION:
        return {
          subject: `Booking cancelled — ${ref}`,
          body: `Your appointment on ${when} (reference ${ref}) has been cancelled.`,
        };
      case NotificationEvent.RESCHEDULE_CONFIRMATION:
        return {
          subject: `Booking rescheduled — ${ref}`,
          body: `Your appointment has been rescheduled to ${when} with ${staffName}. Reference: ${ref}.`,
        };
      case NotificationEvent.NO_SHOW:
        return {
          subject: `Missed appointment — ${ref}`,
          body: `We missed you for your appointment on ${when}. Reference: ${ref}.`,
        };
      case NotificationEvent.LATE_ARRIVAL:
        return {
          subject: `Late arrival noted — ${ref}`,
          body: `Your late arrival for the appointment on ${when} has been noted. Reference: ${ref}.`,
        };
      default:
        return { subject: "Salon notification", body: "You have a notification from your salon." };
    }
  }
}
