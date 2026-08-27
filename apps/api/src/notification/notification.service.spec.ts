import "reflect-metadata";
import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus, NotificationChannel, NotificationEvent, NotificationStatus } from "@salon/shared";
import { NotificationService } from "./notification.service";
import type { Notification } from "../entities/notification.entity";
import type { Appointment } from "../entities/appointment.entity";
import type { Customer } from "../entities/customer.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { NotificationProviderResolver } from "./providers/resolve-notification-provider";
import { TemplateRendererService } from "./services/template-renderer.service";
import type { NotificationRule } from "../entities/notification-rule.entity";
import type { NotificationTemplate } from "../entities/notification-template.entity";
import type { CustomerNotificationPreferences } from "../entities/customer-notification-preferences.entity";
import type { NotificationQuota } from "../entities/notification-quota.entity";
import type { NotificationEventSetting } from "../entities/notification-event-setting.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
    delete: vi.fn(async () => ({ affected: 1 })),
    increment: vi.fn(async () => ({ affected: 1, raw: [], generatedMaps: [] })),
    update: vi.fn(async () => ({ affected: 1, raw: [], generatedMaps: [] })),
  } as unknown as Repository<T>;
}

function fakeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    bookingReference: "ELE-ABC12",
    startTime: new Date("2026-08-20T04:00:00.000Z"),
    status: AppointmentStatus.CONFIRMED,
    staff: { name: "Staff One" },
    ...overrides,
  } as Appointment;
}

function fakeCustomer(overrides: Partial<Customer> = {}): Customer {
  return { id: "cust-1", phone: "+94771234567", email: null, ...overrides } as Customer;
}

function fakeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    settings: { reminderOffsets: [24, 2] },
    ...overrides,
  } as Tenant;
}

function fakeQuota(overrides: Partial<NotificationQuota> = {}): NotificationQuota {
  return {
    id: "quota-1",
    tenantId: "tenant-1",
    month: new Date().toISOString().slice(0, 7),
    emailSent: 0,
    smsSent: 0,
    whatsappSent: 0,
    consoleSent: 0,
    emailLimit: 1000,
    smsLimit: 500,
    whatsappLimit: 500,
    consoleLimit: 5000,
    alertedAt: null,
    ...overrides,
  } as NotificationQuota;
}

describe("NotificationService", () => {
  let notificationsRepo: Repository<Notification>;
  let ruleRepo: Repository<NotificationRule>;
  let templateRepo: Repository<NotificationTemplate>;
  let prefRepo: Repository<CustomerNotificationPreferences>;
  let quotaRepo: Repository<NotificationQuota>;
  let appointmentsRepo: Repository<Appointment>;
  let eventSettingRepo: Repository<NotificationEventSetting>;
  let providers: NotificationProviderResolver;
  let sendMock: ReturnType<typeof vi.fn>;
  let templateRenderer: TemplateRendererService;
  let service: NotificationService;

  beforeEach(() => {
    notificationsRepo = mockRepo<Notification>();
    ruleRepo = mockRepo<NotificationRule>();
    templateRepo = mockRepo<NotificationTemplate>();
    prefRepo = mockRepo<CustomerNotificationPreferences>();
    quotaRepo = mockRepo<NotificationQuota>();
    appointmentsRepo = mockRepo<Appointment>();
    eventSettingRepo = mockRepo<NotificationEventSetting>();

    sendMock = vi.fn(async () => ({ providerMessageId: "msg-1" }));
    providers = {
      resolve: vi.fn(() => ({ send: sendMock })),
    } as unknown as NotificationProviderResolver;

    templateRenderer = new TemplateRendererService();

    vi.mocked(appointmentsRepo.findOne).mockResolvedValue(fakeAppointment());

    service = new NotificationService(
      notificationsRepo,
      ruleRepo,
      templateRepo,
      prefRepo,
      quotaRepo,
      appointmentsRepo,
      eventSettingRepo,
      providers,
      templateRenderer,
    );
  });

  describe("isEventEnabled / setEventEnabled (DECISIONS.md §40)", () => {
    it("defaults to enabled when no row exists for the tenant/event", async () => {
      vi.mocked(eventSettingRepo.findOne).mockResolvedValue(null);
      await expect(service.isEventEnabled("tenant-1", NotificationEvent.CANCELLATION_CONFIRMATION)).resolves.toBe(true);
    });

    it("respects a disabled row", async () => {
      vi.mocked(eventSettingRepo.findOne).mockResolvedValue({
        id: "s1",
        tenantId: "tenant-1",
        eventType: NotificationEvent.CANCELLATION_CONFIRMATION,
        isEnabled: false,
      } as NotificationEventSetting);
      await expect(service.isEventEnabled("tenant-1", NotificationEvent.CANCELLATION_CONFIRMATION)).resolves.toBe(false);
    });

    it("listEventSettings returns every NotificationEvent, defaulting missing rows to enabled", async () => {
      vi.mocked(eventSettingRepo.find).mockResolvedValue([
        { tenantId: "tenant-1", eventType: NotificationEvent.CANCELLATION_CONFIRMATION, isEnabled: false } as NotificationEventSetting,
      ]);
      const settings = await service.listEventSettings("tenant-1");
      expect(settings).toContainEqual({ eventType: NotificationEvent.CANCELLATION_CONFIRMATION, isEnabled: false });
      expect(settings).toContainEqual({ eventType: NotificationEvent.BOOKING_CONFIRMATION, isEnabled: true });
      expect(settings.length).toBe(Object.values(NotificationEvent).length);
    });
  });

  describe("fire", () => {
    it("skips entirely — no row created, nothing sent — when the event is disabled for the tenant", async () => {
      vi.mocked(eventSettingRepo.findOne).mockResolvedValue({ isEnabled: false } as NotificationEventSetting);
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer({ email: "a@b.com" });

      await service.fire(tenant, NotificationEvent.CANCELLATION_CONFIRMATION, appointment, customer);

      expect(notificationsRepo.create).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("always creates + sends a CONSOLE notification", async () => {
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer({ email: null });

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.CONSOLE, recipient: customer.phone }),
      );
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("also creates + sends an EMAIL notification when the customer has an email", async () => {
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer({ email: "a@b.com" });

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.EMAIL, recipient: "a@b.com" }),
      );
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it("marks the notification SENT on a successful delivery", async () => {
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer();

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      expect(notificationsRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: NotificationStatus.SENT, providerMessageId: "msg-1" }),
      );
    });

    it("schedules a retry with the first backoff step on a failed delivery", async () => {
      sendMock.mockRejectedValueOnce(new Error("SMTP down"));
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer();

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      const saved = vi.mocked(notificationsRepo.save).mock.calls.at(-1)?.[0] as Notification;
      expect(saved.status).toBe(NotificationStatus.PENDING);
      expect(saved.retryCount).toBe(1);
      expect(saved.lastError).toBe("SMTP down");
      expect(saved.nextRetryAt).toBeInstanceOf(Date);
    });

    it("marks FAILED permanently once the backoff schedule is exhausted", async () => {
      sendMock.mockRejectedValue(new Error("still down"));
      const notification = {
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        channel: NotificationChannel.CONSOLE,
        type: NotificationEvent.BOOKING_CONFIRMATION,
        recipient: "+94771234567",
        retryCount: 4, // already at the last backoff step
      } as Notification;

      // @ts-expect-error — accessing the private method directly for a focused unit test.
      const result: Notification = await service.attemptDelivery(notification);

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.nextRetryAt).toBeNull();
    });
  });

  describe("sendCampaignMessage", () => {
    it("returns an empty array and sends nothing when WINBACK_OFFER is disabled for the tenant", async () => {
      vi.mocked(eventSettingRepo.findOne).mockResolvedValue({ isEnabled: false } as NotificationEventSetting);
      const tenant = fakeTenant();
      const customer = fakeCustomer({ email: "a@b.com" });

      const sent = await service.sendCampaignMessage(tenant, customer, "Come back soon!");

      expect(sent).toEqual([]);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("always creates + sends a CONSOLE notification with the caller's exact text persisted as body", async () => {
      const tenant = fakeTenant();
      const customer = fakeCustomer({ email: null });

      await service.sendCampaignMessage(tenant, customer, "Come back soon!");

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: null,
          type: NotificationEvent.WINBACK_OFFER,
          channel: NotificationChannel.CONSOLE,
          recipient: customer.phone,
          body: "Come back soon!",
        }),
      );
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("also creates + sends an EMAIL notification when the customer has an email", async () => {
      const tenant = fakeTenant();
      const customer = fakeCustomer({ email: "a@b.com" });

      await service.sendCampaignMessage(tenant, customer, "Come back soon!");

      expect(notificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.EMAIL, recipient: "a@b.com", body: "Come back soon!" }),
      );
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it("a retry sends the persisted body, not a generic fallback, even though there is no appointment", async () => {
      const notification = {
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: null,
        channel: NotificationChannel.EMAIL,
        type: NotificationEvent.WINBACK_OFFER,
        recipient: "a@b.com",
        body: "Come back soon!",
        retryCount: 0,
      } as Notification;
      vi.mocked(notificationsRepo.findOne).mockResolvedValue(notification);

      await service.retry("tenant-1", "notif-1");

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ subject: "A message from your salon", body: "Come back soon!" }),
      );
    });
  });

  describe("quota enforcement (DECISIONS.md §41)", () => {
    it("blocks an SMS send once the monthly quota is reached, without calling the provider", async () => {
      vi.mocked(quotaRepo.findOne).mockResolvedValue(fakeQuota({ smsSent: 500, smsLimit: 500 }));
      const appointment = fakeAppointment();
      const customer = fakeCustomer();

      // @ts-expect-error — accessing the private method directly for a focused unit test.
      const result: Notification = await service.attemptDelivery({
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: appointment.id,
        channel: NotificationChannel.SMS,
        type: NotificationEvent.BOOKING_CONFIRMATION,
        recipient: customer.phone,
        retryCount: 0,
      } as Notification);

      expect(sendMock).not.toHaveBeenCalled();
      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.lastError).toContain("quota");
    });

    it("never blocks CONSOLE even when its counter is at or over its limit", async () => {
      vi.mocked(quotaRepo.findOne).mockResolvedValue(fakeQuota({ consoleSent: 999_999, consoleLimit: 5000 }));
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer();

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("increments the right counter — atomically, via increment() — only after a confirmed successful send", async () => {
      const quota = fakeQuota();
      vi.mocked(quotaRepo.findOne).mockResolvedValue(quota);
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer({ email: "a@b.com" });

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      // CONSOLE and EMAIL both sent successfully — each increments its own column.
      expect(quotaRepo.increment).toHaveBeenCalledWith({ id: quota.id }, "consoleSent", 1);
      expect(quotaRepo.increment).toHaveBeenCalledWith({ id: quota.id }, "emailSent", 1);
    });

    it("does not increment quota when the send itself fails", async () => {
      sendMock.mockRejectedValueOnce(new Error("SMTP down"));
      vi.mocked(quotaRepo.findOne).mockResolvedValue(fakeQuota());
      const tenant = fakeTenant();
      const appointment = fakeAppointment();
      const customer = fakeCustomer({ email: null });

      await service.fire(tenant, NotificationEvent.BOOKING_CONFIRMATION, appointment, customer);

      expect(quotaRepo.increment).not.toHaveBeenCalled();
    });

    it("sets alertedAt once usage crosses 80% of the limit, and only once", async () => {
      const quota = fakeQuota({ smsSent: 399, smsLimit: 500, alertedAt: null }); // 400/500 = 80% after this send
      vi.mocked(quotaRepo.findOne).mockResolvedValue(quota);

      // @ts-expect-error — accessing the private method directly for a focused unit test.
      await service.attemptDelivery({
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        channel: NotificationChannel.SMS,
        type: NotificationEvent.BOOKING_CONFIRMATION,
        recipient: "+94771234567",
        retryCount: 0,
      } as Notification);

      expect(quotaRepo.update).toHaveBeenCalledWith({ id: quota.id }, { alertedAt: expect.any(Date) });
    });

    it("does not re-alert once alertedAt is already set this month", async () => {
      const quota = fakeQuota({ smsSent: 499, smsLimit: 500, alertedAt: new Date() });
      vi.mocked(quotaRepo.findOne).mockResolvedValue(quota);

      // @ts-expect-error — accessing the private method directly for a focused unit test.
      await service.attemptDelivery({
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        channel: NotificationChannel.SMS,
        type: NotificationEvent.BOOKING_CONFIRMATION,
        recipient: "+94771234567",
        retryCount: 0,
      } as Notification);

      expect(quotaRepo.update).not.toHaveBeenCalled();
    });
  });

  describe("retry", () => {
    it("404s when the notification doesn't exist for this tenant", async () => {
      vi.mocked(notificationsRepo.findOne).mockResolvedValue(null);
      await expect(service.retry("tenant-1", "notif-missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("re-attempts delivery immediately", async () => {
      vi.mocked(notificationsRepo.findOne).mockResolvedValue({
        id: "notif-1",
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        channel: NotificationChannel.CONSOLE,
        type: NotificationEvent.BOOKING_CONFIRMATION,
        recipient: "+94771234567",
        retryCount: 1,
      } as Notification);

      const result = await service.retry("tenant-1", "notif-1");

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(NotificationStatus.SENT);
    });
  });
});