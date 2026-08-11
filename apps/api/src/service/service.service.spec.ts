import type { ObjectLiteral, Repository } from "typeorm";
import { ServiceService } from "./service.service";
import type { Service } from "../entities/service.entity";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(),
    findOne: vi.fn(),
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
  let audit: AuditService;
  let service: ServiceService;
  const actor = { userId: "user-1", ipAddress: "127.0.0.1", userAgent: "vitest" };

  beforeEach(() => {
    services = mockRepo<Service>();
    audit = { record: vi.fn() } as unknown as AuditService;
    service = new ServiceService(services, audit);
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
