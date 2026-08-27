import type { ObjectLiteral, Repository } from "typeorm";
import { NotificationEvent } from "@salon/shared";
import { WinbackService } from "./winback.service";
import type { Customer } from "../entities/customer.entity";
import type { Notification } from "../entities/notification.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { NotificationService } from "../notification/notification.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeTenant(): Tenant {
  return { id: "tenant-1", slug: "elegance", name: "Elegance Salon" } as Tenant;
}

function fakeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    tenantId: "tenant-1",
    firstName: "Sanduni",
    lastName: "Fernando",
    phone: "+94771234567",
    email: "sanduni@example.com",
    marketingOptOut: false,
    ...overrides,
  } as Customer;
}

describe("WinbackService", () => {
  let customersRepo: Repository<Customer>;
  let notificationsRepo: Repository<Notification>;
  let notificationService: NotificationService;
  let audit: AuditService;
  let service: WinbackService;

  beforeEach(() => {
    customersRepo = mockRepo<Customer>();
    notificationsRepo = mockRepo<Notification>();
    notificationService = { sendCampaignMessage: vi.fn(async () => []) } as unknown as NotificationService;
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new WinbackService(customersRepo, notificationsRepo, notificationService, audit);
  });

  it("sends to every eligible customer and substitutes {firstName}/{salonName}", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer()]);

    const result = await service.send(
      fakeTenant(),
      { customerIds: ["cust-1"], message: "Hi {firstName}, come back to {salonName}!" },
      "user-1",
    );

    expect(result.sent).toEqual(["cust-1"]);
    expect(notificationService.sendCampaignMessage).toHaveBeenCalledWith(
      fakeTenant(),
      expect.objectContaining({ id: "cust-1" }),
      "Hi Sanduni, come back to Elegance Salon!\n\nVisit https://salon.example.com/unsubscribe/cust-1 to stop these messages.",
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WINBACK_CAMPAIGN_SENT", entityId: "cust-1" }),
    );
  });

  it("appends a working opt-out link even when the Owner's message doesn't mention it (DECISIONS.md §43)", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer()]);

    await service.send(fakeTenant(), { customerIds: ["cust-1"], message: "Come back soon!" }, "user-1");

    expect(notificationService.sendCampaignMessage).toHaveBeenCalledWith(
      fakeTenant(),
      expect.anything(),
      expect.stringContaining("/unsubscribe/cust-1"),
    );
  });

  it("substitutes {unsubscribeUrl} in place rather than also appending a second one, when the Owner placed it explicitly", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer()]);

    await service.send(
      fakeTenant(),
      { customerIds: ["cust-1"], message: "Come back soon! Opt out here: {unsubscribeUrl}" },
      "user-1",
    );

    const sentMessage = vi.mocked(notificationService.sendCampaignMessage).mock.calls[0][2] as string;
    expect(sentMessage).toContain("Opt out here: https://salon.example.com/unsubscribe/cust-1");
    expect(sentMessage.match(/unsubscribe\/cust-1/g)?.length).toBe(1);
  });

  it("skips a customer who has opted out of marketing, without sending", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer({ marketingOptOut: true })]);

    const result = await service.send(fakeTenant(), { customerIds: ["cust-1"], message: "Come back soon!" }, "user-1");

    expect(result.sent).toEqual([]);
    expect(result.skippedOptedOut).toEqual(["cust-1"]);
    expect(notificationService.sendCampaignMessage).not.toHaveBeenCalled();
  });

  it("skips a customer already sent a win-back message within the last 14 days", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer()]);
    vi.mocked(notificationsRepo.findOne).mockResolvedValueOnce({ id: "notif-1" } as Notification);

    const result = await service.send(fakeTenant(), { customerIds: ["cust-1"], message: "Come back soon!" }, "user-1");

    expect(result.sent).toEqual([]);
    expect(result.skippedRecentlyContacted).toEqual(["cust-1"]);
    expect(notificationService.sendCampaignMessage).not.toHaveBeenCalled();
    expect(vi.mocked(notificationsRepo.findOne).mock.calls[0][0]).toMatchObject({
      where: expect.objectContaining({ type: NotificationEvent.WINBACK_OFFER }),
    });
  });

  it("silently drops an id that doesn't belong to this tenant rather than erroring the batch", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([]); // the id simply isn't returned

    const result = await service.send(fakeTenant(), { customerIds: ["stranger"], message: "Come back soon!" }, "user-1");

    expect(result.sent).toEqual([]);
    expect(result.skippedOptedOut).toEqual([]);
    expect(result.skippedRecentlyContacted).toEqual([]);
  });

  it("appends the gift card code to the message when one is supplied", async () => {
    vi.mocked(customersRepo.find).mockResolvedValueOnce([fakeCustomer()]);

    await service.send(
      fakeTenant(),
      { customerIds: ["cust-1"], message: "Come back soon!", giftCardCode: "ele-gc-1234567890" },
      "user-1",
    );

    expect(notificationService.sendCampaignMessage).toHaveBeenCalledWith(
      fakeTenant(),
      expect.anything(),
      expect.stringContaining("ELE-GC-1234567890"),
    );
  });
});
