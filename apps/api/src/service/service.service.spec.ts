import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { DiscountType } from "@salon/shared";
import { ServiceService } from "./service.service";
import type { Service } from "../entities/service.entity";
import type { ServiceDiscount, ServiceDiscountWindow } from "../entities/service-discount.entity";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneOrFail: vi.fn(async () => ({}) as T),
    delete: vi.fn(async () => ({ affected: 1 })),
    count: vi.fn(async () => 0),
  } as unknown as Repository<T>;
  return repo;
}

function baseService(): Service {
  return {
    id: "svc-1",
    tenantId: "tenant-1",
    branchId: null,
    name: "Haircut",
    description: null,
    category: "Hair",
    durationMin: 30,
    priceCents: 500000,
    active: true,
  } as Service;
}

describe("ServiceService", () => {
  let services: Repository<Service>;
  let discounts: Repository<ServiceDiscount>;
  let audit: AuditService;
  let service: ServiceService;
  let dataSource: DataSource;
  // Repos the transaction hands out, so assertions can see what it wrote.
  let txDiscounts: Repository<ServiceDiscount>;
  let txWindows: Repository<ServiceDiscountWindow>;
  const actor = { userId: "user-1", ipAddress: "127.0.0.1", userAgent: "vitest" };

  beforeEach(() => {
    services = mockRepo<Service>();
    discounts = mockRepo<ServiceDiscount>();
    txDiscounts = mockRepo<ServiceDiscount>();
    txWindows = mockRepo<ServiceDiscountWindow>();
    vi.mocked(txDiscounts.save).mockResolvedValue({ id: "disc-1" } as ServiceDiscount);
    audit = { record: vi.fn() } as unknown as AuditService;
    dataSource = {
      transaction: vi.fn(async (cb: (m: unknown) => unknown) =>
        cb({
          getRepository: (entity: { name: string }) =>
            entity.name === "ServiceDiscount" ? txDiscounts : txWindows,
        }),
      ),
    } as unknown as DataSource;
    service = new ServiceService(services, discounts, audit, dataSource);
  });

  describe("setDiscount", () => {
    const dto = {
      type: DiscountType.PERCENT,
      value: 20,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      label: "  September sale  ",
      windows: [{ dayOfWeek: 1, startMin: 1020, endMin: 1200 }],
    };

    beforeEach(() => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());
      vi.mocked(services.findOneOrFail).mockResolvedValue(baseService());
    });

    it("stores the offer against the caller's salon, never one from the body", async () => {
      await service.setDiscount("tenant-1", "svc-1", dto, actor);

      const created = vi.mocked(txDiscounts.create).mock.calls[0][0] as ServiceDiscount;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.serviceId).toBe("svc-1");
      expect(created.type).toBe(DiscountType.PERCENT);
      expect(created.label).toBe("September sale");
    });

    it("replaces the previous windows rather than adding to them", async () => {
      // Otherwise editing an offer accumulates hours nobody chose.
      vi.mocked(txDiscounts.findOne).mockResolvedValue({ id: "disc-1" } as ServiceDiscount);

      await service.setDiscount("tenant-1", "svc-1", dto, actor);

      expect(txWindows.delete).toHaveBeenCalledWith({ discountId: "disc-1" });
    });

    it("keeps the same row when editing, so the offer has one identity", async () => {
      vi.mocked(txDiscounts.findOne).mockResolvedValue({ id: "disc-1" } as ServiceDiscount);

      await service.setDiscount("tenant-1", "svc-1", dto, actor);

      const created = vi.mocked(txDiscounts.create).mock.calls[0][0] as ServiceDiscount;
      expect(created.id).toBe("disc-1");
    });

    it("accepts an offer with no windows, meaning all day", async () => {
      await service.setDiscount("tenant-1", "svc-1", { ...dto, windows: [] }, actor);

      expect(txWindows.create).not.toHaveBeenCalled();
    });

    it("refuses a fixed discount larger than the service price", async () => {
      // The database only caps a line at its own price; this is the check
      // that tells the operator instead of silently making it free.
      await expect(
        service.setDiscount(
          "tenant-1",
          "svc-1",
          { ...dto, type: DiscountType.FIXED, value: 600000 },
          actor,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: "DISCOUNT_TOO_LARGE" });
    });

    it("allows a fixed discount equal to the price", async () => {
      await expect(
        service.setDiscount(
          "tenant-1",
          "svc-1",
          { ...dto, type: DiscountType.FIXED, value: 500000 },
          actor,
        ),
      ).resolves.toBeDefined();
    });

    it("refuses a percentage above 100", async () => {
      await expect(
        service.setDiscount("tenant-1", "svc-1", { ...dto, value: 101 }, actor),
      ).rejects.toMatchObject({ code: "DISCOUNT_TOO_LARGE" });
    });

    it("refuses an end date before the start", async () => {
      await expect(
        service.setDiscount("tenant-1", "svc-1", { ...dto, endDate: "2026-08-01" }, actor),
      ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
    });

    it("refuses a window that ends before it starts", async () => {
      await expect(
        service.setDiscount(
          "tenant-1",
          "svc-1",
          { ...dto, windows: [{ dayOfWeek: 1, startMin: 1200, endMin: 1020 }] },
          actor,
        ),
      ).rejects.toMatchObject({ code: "INVALID_TIME_RANGE" });
    });

    it("refuses a service belonging to another salon", async () => {
      vi.mocked(services.findOne).mockResolvedValue(null);

      await expect(
        service.setDiscount("tenant-1", "someone-elses", dto, actor),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_NOT_FOUND" });
    });

    it("records the change in the audit trail", async () => {
      await service.setDiscount("tenant-1", "svc-1", dto, actor);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "SERVICE_DISCOUNT_SET", tenantId: "tenant-1" }),
        expect.anything(),
      );
    });
  });

  describe("removeDiscount", () => {
    it("refuses when there is nothing to remove", async () => {
      vi.mocked(discounts.findOne).mockResolvedValue(null);

      await expect(service.removeDiscount("tenant-1", "svc-1", actor)).rejects.toMatchObject({
        statusCode: 404,
        code: "DISCOUNT_NOT_FOUND",
      });
    });

    it("deletes the offer and logs it", async () => {
      vi.mocked(discounts.findOne).mockResolvedValue({
        id: "disc-1",
        type: DiscountType.PERCENT,
        value: 20,
      } as ServiceDiscount);
      vi.mocked(services.findOneOrFail).mockResolvedValue(baseService());

      await service.removeDiscount("tenant-1", "svc-1", actor);

      expect(discounts.delete).toHaveBeenCalledWith({ id: "disc-1" });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "SERVICE_DISCOUNT_REMOVED" }),
      );
    });
  });

  describe("create", () => {
    it("persists with the caller's tenantId, always branchId: null", async () => {
      await service.create("tenant-1", {
        name: "Haircut",
        durationMin: 30,
        priceCents: 500000,
      });

      const created = vi.mocked(services.create).mock.calls[0][0] as Service;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.branchId).toBeNull();
      expect(created.active).toBe(true);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("refuses a new service once the plan's active-service cap is reached", async () => {
      vi.mocked(services.count).mockResolvedValueOnce(20);

      await expect(
        service.create("tenant-1", { name: "Colour", durationMin: 60, priceCents: 800000 }, 20),
      ).rejects.toMatchObject({ statusCode: 409, code: "SERVICE_LIMIT_REACHED" });
    });

    it("allows a new service under the cap", async () => {
      vi.mocked(services.count).mockResolvedValueOnce(19);

      await service.create("tenant-1", { name: "Colour", durationMin: 60, priceCents: 800000 }, 20);

      expect(services.save).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("audits a price-only change with correct metadata", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update("tenant-1", "svc-1", { priceCents: 600000 }, actor);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          actorUserId: "user-1",
          action: "SERVICE_PRICE_CHANGED",
          entityType: "Service",
          entityId: "svc-1",
          metadata: { priceCentsBefore: 500000, priceCentsAfter: 600000 },
        }),
      );
    });

    it("audits a duration-only change with correct metadata", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update("tenant-1", "svc-1", { durationMin: 45 }, actor);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { durationMinBefore: 30, durationMinAfter: 45 },
        }),
      );
    });

    it("audits once with both fields when price and duration both change", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update(
        "tenant-1",
        "svc-1",
        { priceCents: 700000, durationMin: 60 },
        actor,
      );

      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            priceCentsBefore: 500000,
            priceCentsAfter: 700000,
            durationMinBefore: 30,
            durationMinAfter: 60,
          },
        }),
      );
    });

    it("does not audit an active-only toggle", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update("tenant-1", "svc-1", { active: false }, actor);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it("does not audit a no-op price value", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update("tenant-1", "svc-1", { priceCents: 500000 }, actor);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it("does not audit name/description/category-only changes", async () => {
      vi.mocked(services.findOne).mockResolvedValue(baseService());

      await service.update("tenant-1", "svc-1", { name: "New Name" }, actor);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws SERVICE_NOT_FOUND for a cross-tenant id (scoped lookup)", async () => {
      vi.mocked(services.findOne).mockResolvedValue(null);

      await expect(
        service.update("tenant-B", "svc-1", { priceCents: 100 }, actor),
      ).rejects.toMatchObject({ statusCode: 404, code: "SERVICE_NOT_FOUND" });
      expect(services.findOne).toHaveBeenCalledWith({
        where: { id: "svc-1", tenantId: "tenant-B" },
      });
    });
  });
});
