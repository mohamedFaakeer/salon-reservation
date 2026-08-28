import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { DEFAULT_TENANT_ENTITLEMENTS } from "@salon/shared";
import { SuperAdminService } from "./super-admin.service";
import type { Appointment } from "../entities/appointment.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { PasswordService } from "../auth/services/password.service";
import type { AuditService } from "../audit/audit.service";
import type { TenantService } from "../tenant/tenant.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[], 0] as [T[], number]),
  } as unknown as Repository<T>;
}

function baseTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    slug: "eagle",
    name: "Eagle Salon",
    status: "ACTIVE",
    customerBookingEnabled: true,
    currency: "LKR",
    timezone: "Asia/Colombo",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    entitlements: DEFAULT_TENANT_ENTITLEMENTS,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("SuperAdminService", () => {
  let tenants: Repository<Tenant>;
  let appointments: Repository<Appointment>;
  let dataSource: DataSource;
  let tenantService: TenantService;
  let passwordService: PasswordService;
  let audit: AuditService;
  let service: SuperAdminService;
  let queryBuilderRows: Array<{ tenantId: string; count: string }>;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    queryBuilderRows = [];
    appointments = {
      createQueryBuilder: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        getRawMany: vi.fn(async () => queryBuilderRows),
      })),
    } as unknown as Repository<Appointment>;
    dataSource = {} as DataSource;
    tenantService = {} as TenantService;
    passwordService = {} as PasswordService;
    audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    service = new SuperAdminService(tenants, appointments, dataSource, tenantService, passwordService, audit);
  });

  describe("getEntitlements / updateEntitlements", () => {
    it("404s for an unknown tenant", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(null);

      await expect(service.getEntitlements("nope")).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    });

    it("resolves the effective modules and limits alongside the raw overrides", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(
        baseTenant({ entitlements: { tier: "LITE", moduleOverrides: { reports: true }, reportPanelOverrides: {}, limitOverrides: {} } }),
      );

      const result = await service.getEntitlements("tenant-1");

      expect(result.tier).toBe("LITE");
      expect(result.modules.reports).toBe(true);
      expect(result.modules.attendance).toBe(false);
      expect(result.limits.maxStaff).toBe(5);
    });

    it("saves a whole-replace of the entitlements and records an audit entry", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

      const result = await service.updateEntitlements(
        "tenant-1",
        { tier: "LITE", limitOverrides: { maxStaff: 8 } },
        "super-admin-1",
      );

      expect(tenants.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: { maxStaff: 8 } },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TENANT_ENTITLEMENTS_UPDATED", tenantId: "tenant-1" }),
      );
      expect(result.limits.maxStaff).toBe(8);
    });
  });

  describe("listTenants", () => {
    it("flags a tenant whose real bookings today exceed its plan limit", async () => {
      vi.mocked(tenants.findAndCount).mockResolvedValueOnce([
        [baseTenant({ entitlements: { tier: "LITE", moduleOverrides: {}, reportPanelOverrides: {}, limitOverrides: {} } })],
        1,
      ]);
      queryBuilderRows = [{ tenantId: "tenant-1", count: "22" }];

      const result = await service.listTenants({ limit: 25, offset: 0 });

      expect(result.data[0].bookingsToday).toBe(22);
      expect(result.data[0].overBookingLimit).toBe(true);
      expect(result.data[0].tier).toBe("LITE");
    });

    it("does not flag a PRO tenant, which has no daily limit by default", async () => {
      vi.mocked(tenants.findAndCount).mockResolvedValueOnce([[baseTenant()], 1]);
      queryBuilderRows = [{ tenantId: "tenant-1", count: "500" }];

      const result = await service.listTenants({ limit: 25, offset: 0 });

      expect(result.data[0].overBookingLimit).toBe(false);
    });

    it("does not query bookings at all when the page is empty", async () => {
      vi.mocked(tenants.findAndCount).mockResolvedValueOnce([[], 0]);

      const result = await service.listTenants({ limit: 25, offset: 0 });

      expect(result.data).toEqual([]);
      expect(appointments.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("carries customerBookingEnabled through to the platform list", async () => {
      vi.mocked(tenants.findAndCount).mockResolvedValueOnce([
        [baseTenant({ customerBookingEnabled: false })],
        1,
      ]);

      const result = await service.listTenants({ limit: 25, offset: 0 });

      expect(result.data[0].customerBookingEnabled).toBe(false);
    });
  });

  describe("setCustomerVisibility — the activate/deactivate switch", () => {
    it("404s for an unknown tenant", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(null);

      await expect(
        service.setCustomerVisibility("nope", { customerBookingEnabled: false }, "super-admin-1"),
      ).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    });

    it("deactivates a salon and records who did it", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant());

      const result = await service.setCustomerVisibility(
        "tenant-1",
        { customerBookingEnabled: false },
        "super-admin-1",
      );

      expect(result).toEqual({ id: "tenant-1", customerBookingEnabled: false });
      expect(tenants.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerBookingEnabled: false }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TENANT_CUSTOMER_VISIBILITY_UPDATED",
          tenantId: "tenant-1",
          actorUserId: "super-admin-1",
          metadata: { customerBookingEnabled: false },
        }),
      );
    });

    it("reactivates a previously deactivated salon", async () => {
      vi.mocked(tenants.findOne).mockResolvedValueOnce(baseTenant({ customerBookingEnabled: false }));

      const result = await service.setCustomerVisibility(
        "tenant-1",
        { customerBookingEnabled: true },
        "super-admin-1",
      );

      expect(result.customerBookingEnabled).toBe(true);
    });
  });
});
