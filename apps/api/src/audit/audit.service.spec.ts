import type { ObjectLiteral, Repository } from "typeorm";
import { AuditService } from "./audit.service";
import type { AuditLog } from "../entities/audit-log.entity";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findAndCount: vi.fn(async () => [[], 0]),
  } as unknown as Repository<T>;
  return repo;
}

describe("AuditService", () => {
  let logs: Repository<AuditLog>;
  let service: AuditService;

  beforeEach(() => {
    logs = mockRepo<AuditLog>();
    service = new AuditService(logs);
  });

  describe("record", () => {
    it("persists all fields", async () => {
      await service.record({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        action: "SERVICE_PRICE_CHANGED",
        entityType: "Service",
        entityId: "svc-1",
        metadata: { priceCentsBefore: 100, priceCentsAfter: 200 },
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
      });

      const created = vi.mocked(logs.create).mock.calls[0][0] as AuditLog;
      expect(created.tenantId).toBe("tenant-1");
      expect(created.actorUserId).toBe("user-1");
      expect(created.action).toBe("SERVICE_PRICE_CHANGED");
      expect(created.metadata).toEqual({ priceCentsBefore: 100, priceCentsAfter: 200 });
      expect(created.ipAddress).toBe("127.0.0.1");
      expect(logs.save).toHaveBeenCalled();
    });

    it("defaults metadata to {} when omitted", async () => {
      await service.record({
        tenantId: null,
        actorUserId: null,
        action: "TENANT_PROVISIONED",
        entityType: "Tenant",
        entityId: "tenant-1",
      });

      const created = vi.mocked(logs.create).mock.calls[0][0] as AuditLog;
      expect(created.metadata).toEqual({});
      expect(created.ipAddress).toBeNull();
      expect(created.userAgent).toBeNull();
    });
  });

  describe("query", () => {
    it("builds tenantId-only where clause with pagination", async () => {
      await service.query("tenant-1", { limit: 50, offset: 0 });

      expect(logs.findAndCount).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
        order: { createdAt: "DESC" },
        take: 50,
        skip: 0,
      });
    });

    it("adds entityType/entityId filters when provided", async () => {
      await service.query("tenant-1", {
        limit: 50,
        offset: 0,
        entityType: "Service",
        entityId: "svc-1",
      });

      expect(logs.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1", entityType: "Service", entityId: "svc-1" },
        }),
      );
    });

    it("adds a date range filter when from/to are both provided", async () => {
      await service.query("tenant-1", {
        limit: 50,
        offset: 0,
        from: "2026-01-01",
        to: "2026-01-31",
      });

      const call = vi.mocked(logs.findAndCount).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where.createdAt).toBeDefined();
    });

    it("returns {data, meta} from findAndCount", async () => {
      vi.mocked(logs.findAndCount).mockResolvedValue([[{ id: "log-1" } as AuditLog], 1]);

      const result = await service.query("tenant-1", { limit: 50, offset: 0 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    });
  });
});
