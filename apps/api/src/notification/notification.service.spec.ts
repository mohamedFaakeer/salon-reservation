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
import { NotificationRule } from "../entities/notification-rule.entity";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { CustomerNotificationPreferences } from "../entities/customer-notification-preferences.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
    delete: vi.fn(async () => ({ affected: 1 })),
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

describe("NotificationService", () => {
  let notificationsRepo: Repository<Notification>;
  let ruleRepo: Repository<NotificationRule>;
  let templateRepo: Repository<NotificationTemplate>;
  let prefRepo: Repository<CustomerNotificationPreferences>;
  let quotaRepo: Repository<NotificationQuota>;
  let appointmentsRepo: Repository<Appointment>;
  let tenantRepo: Repository<Tenant>;
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
    tenantRepo = mockRepo<Tenant>();

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
      tenantRepo,
      providers,
      templateRenderer,
    );
  });

  describe("fire", () => {
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

  describe("runReminderScan", () => {
    it("fires a reminder for a candidate appointment and skips already-notified ones", async () => {
      vi.mocked(tenantRepo.find).mockResolvedValue([fakeTenant()]);
      const candidate = fakeAppointment({ id: "appt-2" });
      (candidate as unknown as { customer: Customer }).customer = fakeCustomer();
      vi.mocked(appointmentsRepo.find).mockResolvedValue([candidate]);
      vi.mocked(notificationsRepo.findOne).mockResolvedValue(null); // not already notified

      await service.runReminderScan();

      expect(sendMock).toHaveBeenCalled();
    });

    it("skips appointments that already have a reminder notification of that type", async () => {
      vi.mocked(tenantRepo.find).mockResolvedValue([fakeTenant()]);
      const candidate = fakeAppointment({ id: "appt-2" });
      (candidate as unknown as { customer: Customer }).customer = fakeCustomer();
      vi.mocked(appointmentsRepo.find).mockResolvedValue([candidate]);
      vi.mocked(notificationsRepo.findOne).mockResolvedValue({ id: "existing" } as Notification);

      await service.runReminderScan();

      expect(notificationsRepo.create).not.toHaveBeenCalled();
    });

    it("skips reminder offsets the tenant hasn't configured", async () => {
      vi.mocked(tenantRepo.find).mockResolvedValue([fakeTenant({ settings: { reminderOffsets: [] } } as never)]);

      await service.runReminderScan();

      expect(appointmentsRepo.find).not.toHaveBeenCalled();
    });
  });
});