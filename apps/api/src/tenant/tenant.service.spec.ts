import type { ObjectLiteral, Repository } from "typeorm";
import { AdvanceRule, DEFAULT_TENANT_SETTINGS } from "@salon/shared";
import { TenantService } from "./tenant.service";
import type { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(),
  } as unknown as Repository<T>;
  return repo;
}

describe("TenantService", () => {
  let tenants: Repository<Tenant>;
  let service: TenantService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    service = new TenantService(tenants);
  });

  describe("createTenant", () => {
    it("applies DEFAULT_TENANT_SETTINGS when no explicit settings given", async () => {
      vi.mocked(tenants.findOne).mockResolvedValue(null);

      const created = await service.createTenant({ slug: "new-salon", name: "New Salon" });

      expect(created.settings).toEqual(DEFAULT_TENANT_SETTINGS);
      expect(created.settings.advanceRule).toBe(AdvanceRule.NO_ADVANCE);
    });
  });

  describe("updateSettings", () => {
    function tenantWithDefaults(): Tenant {
      return {
        id: "t1",
        slug: "elegance",
        name: "Elegance",
        status: TenantStatus.ACTIVE,
        currency: "LKR",
        timezone: "Asia/Colombo",
        settings: structuredClone(DEFAULT_TENANT_SETTINGS),
      } as Tenant;
    }

    it("deep-merges cancellationPolicy, preserving untouched sibling fields", async () => {
      vi.mocked(tenants.findOne).mockResolvedValue(tenantWithDefaults());

      const result = await service.updateSettings("t1", {
        cancellationPolicy: { selfServiceCutoffHours: 4 },
      });

      expect(result.cancellationPolicy.selfServiceCutoffHours).toBe(4);
      expect(result.cancellationPolicy.refundPercentBeforeCutoff).toBe(100);
      expect(result.cancellationPolicy.refundPercentAfterCutoff).toBe(0);
      expect(result.cancellationPolicy.noShowRefundPercent).toBe(0);
    });

    it("shallow-merges top-level fields, leaving other top-level fields untouched", async () => {
      vi.mocked(tenants.findOne).mockResolvedValue(tenantWithDefaults());

      const result = await service.updateSettings("t1", { bookingWindowDays: 45 });

      expect(result.bookingWindowDays).toBe(45);
      expect(result.advanceRule).toBe(AdvanceRule.NO_ADVANCE);
      expect(result.sameDayLeadMinutes).toBe(120);
    });
  });

  describe("updateProfile", () => {
    it("updates only name, leaving slug/currency/timezone untouched", async () => {
      const tenant = {
        id: "t1",
        slug: "elegance",
        name: "Elegance",
        status: TenantStatus.ACTIVE,
        currency: "LKR",
        timezone: "Asia/Colombo",
        settings: structuredClone(DEFAULT_TENANT_SETTINGS),
      } as Tenant;
      vi.mocked(tenants.findOne).mockResolvedValue(tenant);

      const result = await service.updateProfile("t1", { name: "Renamed Salon" });

      expect(result.name).toBe("Renamed Salon");
      expect(result.slug).toBe("elegance");
      expect(result.currency).toBe("LKR");
      expect(result.timezone).toBe("Asia/Colombo");
    });
  });
});
