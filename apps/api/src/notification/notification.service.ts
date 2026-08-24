import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, In, LessThanOrEqual, Repository } from "typeorm";
import { AppointmentStatus, ApiError, NotificationChannel, NotificationEvent, NotificationStatus } from "@salon/shared";
import type { 
  NotificationQueryDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  NotificationRuleQueryDto,
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  CustomerNotificationPreferencesDto,
} from "@salon/shared";
import { Notification } from "../entities/notification.entity";
import { NotificationRule } from "../entities/notification-rule.entity";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { CustomerNotificationPreferences } from "../entities/customer-notification-preferences.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";
import { Appointment } from "../entities/appointment.entity";
import type { Customer } from "../entities/customer.entity";
import { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationProviderResolver } from "./providers/resolve-notification-provider";
import { TemplateRendererService } from "./services/template-renderer.service";

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
    @InjectRepository(NotificationRule) private readonly ruleRepo: Repository<NotificationRule>,
    @InjectRepository(NotificationTemplate) private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(CustomerNotificationPreferences) private readonly prefRepo: Repository<CustomerNotificationPreferences>,
    @InjectRepository(NotificationQuota) private readonly quotaRepo: Repository<NotificationQuota>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly providers: NotificationProviderResolver,
    private readonly templateRenderer: TemplateRendererService,
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

  // ============ Notification Rules ============

  async createRule(tenantId: string, dto: CreateNotificationRuleDto): Promise<NotificationRule> {
    const rule = this.ruleRepo.create({
      tenantId,
      name: dto.name,
      timingType: dto.timingType,
      timingValue: dto.timingValue as Record<string, unknown>,
      channels: dto.channels,
      targeting: dto.targeting ? (dto.targeting as Record<string, unknown>) : {},
      priority: dto.priority || 0,
      templateSubject: dto.templateSubject,
      templateBody: dto.templateBody,
      isEnabled: dto.isEnabled ?? true,
    });
    return this.ruleRepo.save(rule);
  }

  async listRules(tenantId: string, query: NotificationRuleQueryDto): Promise<{ data: NotificationRule[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (query.eventType) where.eventType = query.eventType;
    if (query.isEnabled !== undefined) where.isEnabled = query.isEnabled;

    const [data, total] = await this.ruleRepo.findAndCount({
      where,
      order: { priority: "DESC", createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, total };
  }

  async getRule(tenantId: string, id: string): Promise<NotificationRule | null> {
    return this.ruleRepo.findOne({ where: { id, tenantId } });
  }

  async updateRule(tenantId: string, id: string, dto: UpdateNotificationRuleDto): Promise<NotificationRule | null> {
    const rule = await this.getRule(tenantId, id);
    if (!rule) return null;

    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    await this.ruleRepo.delete({ id, tenantId });
  }

  // ============ Notification Templates ============

  async createTemplate(tenantId: string, dto: CreateNotificationTemplateDto): Promise<NotificationTemplate> {
    const template = this.templateRepo.create({
      tenantId,
      name: dto.name,
      eventType: dto.eventType,
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      variables: dto.variables || this.templateRenderer.extractVariables(dto.body),
      isSystem: dto.isSystem ?? false,
    });
    return this.templateRepo.save(template);
  }

  async listTemplates(tenantId: string, query: NotificationRuleQueryDto): Promise<{ data: NotificationTemplate[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (query.eventType) where.eventType = query.eventType;
    if (query.isEnabled !== undefined) where.isSystem = !query.isEnabled; // isEnabled in query maps to isSystem=false

    const [data, total] = await this.templateRepo.findAndCount({
      where,
      order: { eventType: "ASC", channel: "ASC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, total };
  }

  async getTemplate(tenantId: string, id: string): Promise<NotificationTemplate | null> {
    return this.templateRepo.findOne({ where: { id, tenantId } });
  }

  async updateTemplate(tenantId: string, id: string, dto: UpdateNotificationTemplateDto): Promise<NotificationTemplate | null> {
    const template = await this.getTemplate(tenantId, id);
    if (!template) return null;

    Object.assign(template, dto);
    if (dto.body) {
      template.variables = this.templateRenderer.extractVariables(dto.body);
    }
    return this.templateRepo.save(template);
  }

  async deleteTemplate(tenantId: string, id: string): Promise<void> {
    await this.templateRepo.delete({ id, tenantId });
  }

  // ============ Quota ============

  async getQuota(tenantId: string, channel?: NotificationChannel): Promise<{ channel: NotificationChannel; used: number; limit: number; remaining: number }[]> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const where: Record<string, unknown> = { tenantId, month: currentMonth };

    const quotas = await this.quotaRepo.find({ where });
    
    if (quotas.length === 0) {
      // Return default quotas if none configured
      const defaultChannels = channel ? [channel] : [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.WHATSAPP, NotificationChannel.CONSOLE];
      return defaultChannels.map((ch) => ({
        channel: ch,
        used: 0,
        limit: ch === NotificationChannel.EMAIL ? 1000 : ch === NotificationChannel.CONSOLE ? 5000 : 500,
        remaining: ch === NotificationChannel.EMAIL ? 1000 : ch === NotificationChannel.CONSOLE ? 5000 : 500,
      }));
    }

    // The quota entity stores per-channel data in separate columns
    const quota = quotas[0];
    const result: { channel: NotificationChannel; used: number; limit: number; remaining: number }[] = [];
    
    const channelsToCheck = channel ? [channel] : [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.WHATSAPP, NotificationChannel.CONSOLE];
    
    for (const ch of channelsToCheck) {
      let used = 0;
      let limit = 0;
      switch (ch) {
        case NotificationChannel.EMAIL:
          used = quota.emailSent;
          limit = quota.emailLimit;
          break;
        case NotificationChannel.SMS:
          used = quota.smsSent;
          limit = quota.smsLimit;
          break;
        case NotificationChannel.WHATSAPP:
          used = quota.whatsappSent;
          limit = quota.whatsappLimit;
          break;
        case NotificationChannel.CONSOLE:
          used = quota.consoleSent;
          limit = quota.consoleLimit;
          break;
      }
      result.push({
        channel: ch,
        used,
        limit,
        remaining: Math.max(0, limit - used),
      });
    }
    
    return result;
  }

  // ============ Customer Preferences ============

  async getCustomerPreferences(tenantId: string, customerId: string): Promise<CustomerNotificationPreferences | null> {
    const prefs = await this.prefRepo.findOne({ where: { tenantId, customerId } });
    return prefs || null;
  }

  async updateCustomerPreferences(
    tenantId: string,
    customerId: string,
    dto: CustomerNotificationPreferencesDto,
  ): Promise<CustomerNotificationPreferences> {
    let prefs = await this.getCustomerPreferences(tenantId, customerId);
    if (!prefs) {
      prefs = this.prefRepo.create({
        tenantId,
        customerId,
        emailOptIn: dto.emailEnabled ?? true,
        smsOptIn: dto.smsEnabled ?? true,
        whatsappOptIn: dto.whatsappEnabled ?? true,
        marketingOptIn: dto.marketing ?? false,
      });
    } else {
      // Map DTO fields to entity fields
      if (dto.emailEnabled !== undefined) prefs.emailOptIn = dto.emailEnabled;
      if (dto.smsEnabled !== undefined) prefs.smsOptIn = dto.smsEnabled;
      if (dto.whatsappEnabled !== undefined) prefs.whatsappOptIn = dto.whatsappEnabled;
      if (dto.marketing !== undefined) prefs.marketingOptIn = dto.marketing;
    }
    return this.prefRepo.save(prefs);
  }
}
