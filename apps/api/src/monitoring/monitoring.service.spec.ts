import type { ObjectLiteral, Repository } from "typeorm";
import { MonitoringService } from "./monitoring.service";
import type { AuditService } from "../audit/audit.service";
import type { Appointment } from "../entities/appointment.entity";
import type { AuditLog } from "../entities/audit-log.entity";
import type { ErrorLog } from "../entities/error-log.entity";
import type { NotificationQuota } from "../entities/notification-quota.entity";
import type { Payment } from "../entities/payment.entity";
import type { SecurityEventReview } from "../entities/security-event-review.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { User } from "../entities/user.entity";

type MockedRepo<T extends ObjectLiteral> = Repository<T> & {
  __queryBuilder: {
    select: ReturnType<typeof vi.fn>;
    addSelect: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    andWhere: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    addGroupBy: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    getCount: ReturnType<typeof vi.fn>;
    getRawMany: ReturnType<typeof vi.fn>;
    getRawOne: ReturnType<typeof vi.fn>;
  };
};

function mockRepo<T extends ObjectLiteral>(overrides: Partial<Record<string, unknown>> = {}): MockedRepo<T> {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    addGroupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    getCount: vi.fn(async () => 0),
    getRawMany: vi.fn(async () => []),
    getRawOne: vi.fn(async () => undefined),
  };
  return {
    find: vi.fn(async () => []),
    findOne: vi.fn(async () => null),
    findAndCount: vi.fn(async () => [[], 0]),
    save: vi.fn(async (e: unknown) => e),
    create: vi.fn((e: unknown) => e),
    count: vi.fn(async () => 0),
    createQueryBuilder: vi.fn(() => queryBuilder),
    __queryBuilder: queryBuilder,
    ...overrides,
  } as unknown as MockedRepo<T>;
}

function mockAudit(): AuditService {
  return {
    record: vi.fn(async () => undefined),
    queryAcrossTenants: vi.fn(async () => ({ data: [], meta: { total: 0, limit: 50, offset: 0 } })),
    countRecentByEntity: vi.fn(async () => new Map()),
  } as unknown as AuditService;
}

describe("MonitoringService", () => {
  let tenants: MockedRepo<Tenant>;
  let appointments: MockedRepo<Appointment>;
  let payments: MockedRepo<Payment>;
  let users: MockedRepo<User>;
  let quotas: MockedRepo<NotificationQuota>;
  let errorLogs: MockedRepo<ErrorLog>;
  let reviews: MockedRepo<SecurityEventReview>;
  let audit: AuditService;
  let service: MonitoringService;

  beforeEach(() => {
    tenants = mockRepo<Tenant>();
    appointments = mockRepo<Appointment>();
    payments = mockRepo<Payment>();
    users = mockRepo<User>();
    quotas = mockRepo<NotificationQuota>();
    errorLogs = mockRepo<ErrorLog>();
    reviews = mockRepo<SecurityEventReview>();
    audit = mockAudit();
    service = new MonitoringService(
      tenants,
      appointments,
      payments,
      users,
      quotas,
      errorLogs,
      reviews,
      audit,
    );
  });

  describe("tenantUsage", () => {
    it("includes a live lockedAccountCount per tenant, defaulting to 0", async () => {
      tenants.findAndCount = vi.fn(async () => [[{ id: "tenant-1", name: "Elegance", slug: "elegance" }] as Tenant[], 1] as [Tenant[], number]);
      users.__queryBuilder.getRawMany
        .mockResolvedValueOnce([]) // lastLoginRows
        .mockResolvedValueOnce([{ tenantId: "tenant-1", count: 2 }]); // lockedRows

      const result = await service.tenantUsage({ limit: 50, offset: 0 });

      expect(result.data[0]).toMatchObject({ tenantId: "tenant-1", lockedAccountCount: 2 });
    });

    it("defaults lockedAccountCount to 0 for a tenant with nothing locked", async () => {
      tenants.findAndCount = vi.fn(async () => [[{ id: "tenant-2", name: "Serenity", slug: "serenity" }] as Tenant[], 1] as [Tenant[], number]);
      users.__queryBuilder.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.tenantUsage({ limit: 50, offset: 0 });

      expect(result.data[0].lockedAccountCount).toBe(0);
    });
  });

  describe("overview", () => {
    it("counts a tenant near quota only once even if multiple channels are near their limit", async () => {
      vi.mocked(quotas.find).mockResolvedValue([
        {
          tenantId: "tenant-1",
          emailSent: 850,
          emailLimit: 1000, // 85% — near
          smsSent: 480,
          smsLimit: 500, // 96% — also near, same tenant
          whatsappSent: 0,
          whatsappLimit: 500,
        },
        {
          tenantId: "tenant-2",
          emailSent: 10,
          emailLimit: 1000,
          smsSent: 0,
          smsLimit: 500,
          whatsappSent: 0,
          whatsappLimit: 500,
        },
      ] as never);

      const result = await service.overview();

      expect(result.tenantsNearQuota).toBe(1);
    });
  });

  describe("listErrors", () => {
    it("enriches each row with severity and a plain-language explanation, resolving the tenant name", async () => {
      vi.mocked(errorLogs.findAndCount).mockResolvedValue([
        [
          {
            id: "err-1",
            tenantId: "tenant-1",
            statusCode: 500,
            code: "INTERNAL_ERROR",
            path: "/bookings",
            message: "boom",
            status: "NEW",
            createdAt: new Date(),
          } as ErrorLog,
        ],
        1,
      ]);
      errorLogs.__queryBuilder.getRawMany = vi.fn(async () => [{ code: "INTERNAL_ERROR", path: "/bookings", count: 1 }]);
      vi.mocked(tenants.find).mockResolvedValue([{ id: "tenant-1", name: "Elegance Salon" }] as never);

      const result = await service.listErrors({ limit: 50, offset: 0 } as never);

      expect(result.data[0].severity).toBeDefined();
      expect(result.data[0].tenantName).toBe("Elegance Salon");
      expect(result.data[0].title).toBeTruthy();
      expect(result.data[0].plainLanguage).toContain("Elegance Salon");
    });

    it("returns an empty page without querying tenant names when there are no rows", async () => {
      const result = await service.listErrors({ limit: 50, offset: 0 } as never);
      expect(result.data).toEqual([]);
      expect(tenants.find).not.toHaveBeenCalled();
    });
  });

  describe("updateErrorStatus", () => {
    it("throws NOT_FOUND for an unknown id", async () => {
      vi.mocked(errorLogs.findOne).mockResolvedValue(null);
      await expect(service.updateErrorStatus("nope", "RESOLVED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("persists the new status on an existing row", async () => {
      const row = { id: "err-1", status: "NEW" } as ErrorLog;
      vi.mocked(errorLogs.findOne).mockResolvedValue(row);

      const result = await service.updateErrorStatus("err-1", "ACKNOWLEDGED");

      expect(result.status).toBe("ACKNOWLEDGED");
      expect(errorLogs.save).toHaveBeenCalledWith(expect.objectContaining({ status: "ACKNOWLEDGED" }));
    });
  });

  describe("listSecurityEvents", () => {
    it("defaults an untriaged event's status to NEW and escalates severity on repeated failed logins", async () => {
      const row = {
        id: "log-1",
        tenantId: "tenant-1",
        action: "LOGIN_FAILED",
        entityId: "owner@elegance.salon",
        entityType: "User",
        metadata: {},
        ipAddress: "203.0.113.7",
        userAgent: "test",
        createdAt: new Date(),
        actorUser: null,
        tenant: { id: "tenant-1", name: "Elegance Salon" },
      } as unknown as AuditLog;
      vi.mocked(audit.queryAcrossTenants).mockResolvedValue({
        data: [row],
        meta: { total: 1, limit: 50, offset: 0 },
      });
      vi.mocked(audit.countRecentByEntity).mockResolvedValue(new Map([["owner@elegance.salon", 6]]));
      vi.mocked(reviews.find).mockResolvedValue([]);

      const result = await service.listSecurityEvents({ limit: 50, offset: 0 } as never);

      expect(result.data[0].status).toBe("NEW");
      expect(result.data[0].severity).toBe("HIGH");
      expect(result.data[0].plainLanguage).toContain("6 times");
    });

    it("reflects a previously-set review status instead of defaulting to NEW", async () => {
      const row = {
        id: "log-1",
        tenantId: null,
        action: "RATE_LIMIT_EXCEEDED",
        entityId: "sign-in",
        entityType: "RateLimitRule",
        metadata: { bucketKey: "sign-in:ip:1.2.3.4" },
        ipAddress: "1.2.3.4",
        userAgent: null,
        createdAt: new Date(),
        actorUser: null,
        tenant: null,
      } as unknown as AuditLog;
      vi.mocked(audit.queryAcrossTenants).mockResolvedValue({
        data: [row],
        meta: { total: 1, limit: 50, offset: 0 },
      });
      vi.mocked(reviews.find).mockResolvedValue([{ auditLogId: "log-1", status: "RESOLVED" }] as never);

      const result = await service.listSecurityEvents({ limit: 50, offset: 0 } as never);

      expect(result.data[0].status).toBe("RESOLVED");
    });
  });

  describe("updateSecurityEventStatus", () => {
    it("creates a new review row when none exists yet", async () => {
      vi.mocked(reviews.findOne).mockResolvedValue(null);

      await service.updateSecurityEventStatus("log-1", "ACKNOWLEDGED", "admin-1");

      expect(reviews.create).toHaveBeenCalledWith(
        expect.objectContaining({ auditLogId: "log-1", status: "ACKNOWLEDGED", reviewedByUserId: "admin-1" }),
      );
      expect(reviews.save).toHaveBeenCalled();
    });

    it("updates the existing review row instead of creating a duplicate", async () => {
      const existing = { auditLogId: "log-1", status: "ACKNOWLEDGED", reviewedByUserId: "admin-1" };
      vi.mocked(reviews.findOne).mockResolvedValue(existing as never);

      await service.updateSecurityEventStatus("log-1", "RESOLVED", "admin-2");

      expect(reviews.create).not.toHaveBeenCalled();
      expect(reviews.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "RESOLVED", reviewedByUserId: "admin-2" }),
      );
    });
  });
});
