import "reflect-metadata";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Repository } from "typeorm";
import { NotificationEvaluatorService } from "./notification-evaluator.service";
import { TemplateRendererService } from "./template-renderer.service";
import type { NotificationService } from "../notification.service";
import { NotificationRule } from "../../entities/notification-rule.entity";
import { NotificationTemplate } from "../../entities/notification-template.entity";
import { AppointmentStatus, NotificationEvent } from "@salon/shared";
import type { Appointment } from "../../entities/appointment.entity";
import type { Customer } from "../../entities/customer.entity";
import type { Tenant } from "../../entities/tenant.entity";

function mockRepo<T>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

describe("NotificationEvaluatorService", () => {
  let ruleRepo: Repository<NotificationRule>;
  let templateRepo: Repository<NotificationTemplate>;
  let templateRenderer: TemplateRendererService;
  let notificationService: NotificationService;
  let service: NotificationEvaluatorService;

  beforeEach(() => {
    ruleRepo = mockRepo<NotificationRule>();
    templateRepo = mockRepo<NotificationTemplate>();
    templateRenderer = new TemplateRendererService();
    notificationService = {
      isEventEnabled: vi.fn(async () => true),
      sendForRule: vi.fn(async () => ({ id: "notif-1" })),
    } as unknown as NotificationService;
    service = new NotificationEvaluatorService(ruleRepo, templateRepo, templateRenderer, notificationService);
  });

  it("evaluates matching rules and renders template", async () => {
    const fakeRule: Partial<NotificationRule> = {
      id: "rule-1",
      tenantId: "tenant-1",
      name: "24h Reminder",
      timingType: "BEFORE_APPT",
      timingValue: { offsetHours: 24 },
      channels: ["sms"],
      templateSubject: null,
      templateBody: "Hi {{customerName}}, reminder for {{serviceNames}} on {{appointmentDate}}.",
      targeting: {},
      isEnabled: true,
      priority: 0,
    };

    vi.mocked(ruleRepo.find).mockResolvedValue([fakeRule as NotificationRule]);

    const tenant: Partial<Tenant> = { id: "tenant-1", name: "Salon Test" };
    const appointment: Partial<Appointment> = {
      id: "appt-1",
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      bookingReference: "REF-123",
      staff: { name: "Staff Member" } as any,
      lines: [{ service: { name: "Haircut" } }] as any,
    };
    const customer: Partial<Customer> = {
      id: "cust-1",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+94771234567",
    };

    const results = await service.evaluate({
      tenant: tenant as Tenant,
      appointment: appointment as Appointment,
      customer: customer as Customer,
      eventType: NotificationEvent.REMINDER_24H,
      now: new Date(),
    });

    expect(results.length).toBe(1);
    expect(results[0].shouldSend).toBe(true);
    expect(results[0].renderedBody).toContain("Jane Doe");
  });

  it("filters out rules that do not match targeting criteria", async () => {
    const targetedRule: Partial<NotificationRule> = {
      id: "rule-2",
      tenantId: "tenant-1",
      name: "VIP Staff Rule",
      timingType: "BEFORE_APPT",
      timingValue: { offsetHours: 24 },
      channels: ["sms"],
      templateBody: "VIP Reminder",
      targeting: { staffIds: ["staff-vip"] },
      isEnabled: true,
      priority: 0,
    };

    vi.mocked(ruleRepo.find).mockResolvedValue([targetedRule as NotificationRule]);

    const tenant: Partial<Tenant> = { id: "tenant-1" };
    const appointment: Partial<Appointment> = {
      id: "appt-1",
      staffId: "staff-regular",
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
    };
    const customer: Partial<Customer> = { id: "cust-1", phone: "+94771234567" };

    const results = await service.evaluate({
      tenant: tenant as Tenant,
      appointment: appointment as Appointment,
      customer: customer as Customer,
      eventType: NotificationEvent.REMINDER_24H,
      now: new Date(),
    });

    expect(results.length).toBe(0);
  });

  it("returns no results at all — without even reading rules — when the event is disabled tenant-wide (DECISIONS.md §40)", async () => {
    vi.mocked(notificationService.isEventEnabled).mockResolvedValue(false);
    const tenant: Partial<Tenant> = { id: "tenant-1" };
    const appointment: Partial<Appointment> = {
      id: "appt-1",
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
    };
    const customer: Partial<Customer> = { id: "cust-1", phone: "+94771234567" };

    const results = await service.evaluate({
      tenant: tenant as Tenant,
      appointment: appointment as Appointment,
      customer: customer as Customer,
      eventType: NotificationEvent.REMINDER_24H,
      now: new Date(),
    });

    expect(results).toEqual([]);
    expect(ruleRepo.find).not.toHaveBeenCalled();
  });
});
