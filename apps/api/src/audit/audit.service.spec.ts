import type { ObjectLiteral, Repository } from "typeorm";
import { AuditService } from "./audit.service";
import type { PlatformAlertService } from "../alerting/platform-alert.service";
import type { AuditLog } from "../entities/audit-log.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { User } from "../entities/user.entity";

function mockRepo<T extends ObjectLiteral>() {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawMany: vi.fn(async () => []),
    getMany: vi.fn(async () => []),
  };
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "log-1", metadata: {}, ...e }) as T),
    findAndCount: vi.fn(async () => [[], 0]),
    findOne: vi.fn(async () => null),
    createQueryBuilder: vi.fn(() => queryBuilder),
  } as unknown as Repository<T> & { __queryBuilder: typeof queryBuilder };
  (repo as unknown as { __queryBuilder: typeof queryBuilder }).__queryBuilder = queryBuilder;
  return repo;
}

function mockAlerts(): PlatformAlertService {
  return { send: vi.fn(async () => undefined) } as unknown as PlatformAlertService;
}

describe("AuditService", () => {
  let logs: Repository<AuditLog> & {
    __queryBuilder: {
      getRawMany: ReturnType<typeof vi.fn>;
      getMany: ReturnType<typeof vi.fn>;
      andWhere: ReturnType<typeof vi.fn>;
    };
  };
  let users: Repository<User>;
  let tenants: Repository<Tenant>;
  let alerts: PlatformAlertService;
  let service: AuditService;

  beforeEach(() => {
    logs = mockRepo<AuditLog>();
    users = mockRepo<User>();
    tenants = mockRepo<Tenant>();
    alerts = mockAlerts();
    service = new AuditService(logs, users, tenants, alerts);
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

      expect(logs.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
          order: { createdAt: "DESC" },
          take: 50,
          skip: 0,
        }),
      );
    });

    it("never selects the actor's password hash", async () => {
      // The actor is joined so the log can name a person, but User carries
      // `passwordHash` with no `select: false` — an unscoped join would
      // serialise every actor's argon2 hash into this response. The select
      // must stay an explicit allow-list.
      await service.query("tenant-1", { limit: 50, offset: 0 });

      const args = vi.mocked(logs.findAndCount).mock.calls[0][0];
      const actorSelect = (args?.select as { actorUser?: Record<string, boolean> })?.actorUser;

      expect(actorSelect).toBeDefined();
      expect(Object.keys(actorSelect ?? {}).sort()).toEqual(["email", "id", "name"]);
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

  describe("queryAcrossTenants", () => {
    it("omits tenantId from the where clause when none is given — every tenant's events", async () => {
      await service.queryAcrossTenants({ actions: ["LOGIN_FAILED"], limit: 50, offset: 0 });

      const call = vi.mocked(logs.findAndCount).mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.tenantId).toBeUndefined();
      expect(call.where.action).toBe("LOGIN_FAILED");
    });

    it("scopes to one tenant when tenantId is given", async () => {
      await service.queryAcrossTenants({ tenantId: "tenant-1", actions: ["LOGIN_FAILED"], limit: 50, offset: 0 });

      const call = vi.mocked(logs.findAndCount).mock.calls[0][0] as { where: Record<string, unknown> };
      expect(call.where.tenantId).toBe("tenant-1");
    });

    it("joins the tenant relation, not just the actor", async () => {
      await service.queryAcrossTenants({ actions: ["LOGIN_FAILED"], limit: 50, offset: 0 });

      const call = vi.mocked(logs.findAndCount).mock.calls[0][0] as { relations: Record<string, boolean> };
      expect(call.relations.tenant).toBe(true);
    });
  });

  describe("countRecentByEntity", () => {
    it("returns an empty map without querying when there are no entityIds", async () => {
      const result = await service.countRecentByEntity("LOGIN_FAILED", [], new Date());
      expect(result.size).toBe(0);
      expect(logs.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("builds a map keyed by entityId from the grouped count", async () => {
      const qb = (logs as unknown as { __queryBuilder: { getRawMany: ReturnType<typeof vi.fn> } }).__queryBuilder;
      qb.getRawMany.mockResolvedValue([
        { entityId: "user-1", count: "5" },
        { entityId: "user-2", count: "1" },
      ]);

      const result = await service.countRecentByEntity("LOGIN_FAILED", ["user-1", "user-2"], new Date());

      expect(result.get("user-1")).toBe(5);
      expect(result.get("user-2")).toBe(1);
    });
  });

  describe("lockoutExpiry", () => {
    const THRESHOLD = 5;
    const WINDOW_MS = 15 * 60_000;

    it("returns null when there are fewer failures than the threshold", async () => {
      vi.mocked(logs.findOne).mockResolvedValue(null); // no prior success
      logs.__queryBuilder.getMany.mockResolvedValue([{ createdAt: new Date() } as AuditLog]);

      const result = await service.lockoutExpiry("user-1", "LOGIN_FAILED", "LOGIN_SUCCEEDED", THRESHOLD, WINDOW_MS);

      expect(result).toBeNull();
    });

    it("returns the expiry moment (oldest of the threshold batch, plus the window) once the threshold is met", async () => {
      vi.mocked(logs.findOne).mockResolvedValue(null);
      const now = Date.now();
      const failures = [4, 3, 2, 1, 0].map((minAgo) => ({ createdAt: new Date(now - minAgo * 60_000) }) as AuditLog);
      logs.__queryBuilder.getMany.mockResolvedValue(failures);

      const result = await service.lockoutExpiry("user-1", "LOGIN_FAILED", "LOGIN_SUCCEEDED", THRESHOLD, WINDOW_MS);

      // The oldest of the 5 (4 minutes ago) plus the 15-minute window.
      expect(result?.getTime()).toBe(failures[4].createdAt.getTime() + WINDOW_MS);
    });

    it("returns null once the oldest of the threshold batch has already aged past the window", async () => {
      vi.mocked(logs.findOne).mockResolvedValue(null);
      const now = Date.now();
      // All 5 failures happened, but the oldest was 20 minutes ago — outside a 15-minute window.
      const failures = [20, 19, 18, 17, 16].map((minAgo) => ({ createdAt: new Date(now - minAgo * 60_000) }) as AuditLog);
      logs.__queryBuilder.getMany.mockResolvedValue(failures);

      const result = await service.lockoutExpiry("user-1", "LOGIN_FAILED", "LOGIN_SUCCEEDED", THRESHOLD, WINDOW_MS);

      expect(result).toBeNull();
    });

    it("only counts failures since the account's own most recent success — a success resets the count", async () => {
      const now = Date.now();
      // Succeeded 2 minutes ago; the query builder is expected to be scoped
      // to failures after that point (asserted via the andWhere call, since
      // this mock can't filter the canned failures list itself).
      vi.mocked(logs.findOne).mockResolvedValue({ createdAt: new Date(now - 2 * 60_000) } as AuditLog);
      logs.__queryBuilder.getMany.mockResolvedValue([]); // nothing since the success

      const result = await service.lockoutExpiry("user-1", "LOGIN_FAILED", "LOGIN_SUCCEEDED", THRESHOLD, WINDOW_MS);

      expect(result).toBeNull();
      expect(logs.__queryBuilder.andWhere).toHaveBeenCalledWith(
        'a."createdAt" > :lastSuccess',
        expect.objectContaining({ lastSuccess: expect.any(Date) }),
      );
    });
  });

  describe("record — immediate alerting", () => {
    /** Flushes the fire-and-forget maybeAlert() chain (see record()'s "not awaited" comment). */
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("never alerts on an ordinary business action", async () => {
      await service.record({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        action: "SERVICE_PRICE_CHANGED",
        entityType: "Service",
        entityId: "svc-1",
      });
      await flush();

      expect(alerts.send).not.toHaveBeenCalled();
    });

    it("does not alert on an isolated LOGIN_FAILED (LOW severity)", async () => {
      logs.__queryBuilder.getRawMany.mockResolvedValue([{ entityId: "user-1", count: "1" }]);

      await service.record({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: "user-1",
      });
      await flush();

      expect(alerts.send).not.toHaveBeenCalled();
    });

    it("alerts immediately on repeated LOGIN_FAILED (HIGH severity), naming the actor and tenant", async () => {
      logs.__queryBuilder.getRawMany.mockResolvedValue([{ entityId: "user-1", count: "6" }]);
      vi.mocked(users.findOne).mockResolvedValue({ id: "user-1", name: "Nadeesha" } as User);
      vi.mocked(tenants.findOne).mockResolvedValue({ id: "tenant-1", name: "Elegance Salon" } as Tenant);

      await service.record({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: "user-1",
      });
      await flush();

      expect(alerts.send).toHaveBeenCalledTimes(1);
      const [subject, body] = vi.mocked(alerts.send).mock.calls[0];
      expect(subject).toContain("HIGH");
      expect(body).toContain("Nadeesha");
      expect(body).toContain("Elegance Salon");
    });

    it("always alerts on REFRESH_TOKEN_REUSE_DETECTED (CRITICAL), even as an isolated event", async () => {
      logs.__queryBuilder.getRawMany.mockResolvedValue([]);

      await service.record({
        tenantId: null,
        actorUserId: "user-1",
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        entityType: "RefreshSession",
        entityId: "sess-1",
      });
      await flush();

      expect(alerts.send).toHaveBeenCalledTimes(1);
      expect(vi.mocked(alerts.send).mock.calls[0][0]).toContain("CRITICAL");
    });

    it("a failed alert evaluation is logged, not thrown — record() itself already resolved", async () => {
      vi.mocked(alerts.send).mockRejectedValue(new Error("smtp down"));
      logs.__queryBuilder.getRawMany.mockResolvedValue([]);

      await expect(
        service.record({
          tenantId: null,
          actorUserId: "user-1",
          action: "REFRESH_TOKEN_REUSE_DETECTED",
          entityType: "RefreshSession",
          entityId: "sess-1",
        }),
      ).resolves.toBeUndefined();
      await flush();
    });
  });
});
