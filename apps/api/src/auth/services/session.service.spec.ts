import type { ObjectLiteral, Repository } from "typeorm";
import { ApiError } from "@salon/shared";
import { SessionService } from "./session.service";
import type { RefreshSession } from "../../entities/refresh-session.entity";
import type { User } from "../../entities/user.entity";
import type { UserTenantRole } from "../../entities/user-tenant-role.entity";

function mockRepo<T extends ObjectLiteral>() {
  const repo = {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Repository<T>;
  return repo;
}

describe("SessionService", () => {
  let session: SessionService;
  let refreshRepo: Repository<RefreshSession>;
  let userRepo: Repository<User>;
  let roleRepo: Repository<UserTenantRole>;

  beforeEach(() => {
    refreshRepo = mockRepo<RefreshSession>();
    userRepo = mockRepo<User>();
    roleRepo = mockRepo<UserTenantRole>();
    session = new SessionService(refreshRepo, userRepo, roleRepo);
  });

  describe("createSession", () => {
    it("stores only the SHA-256 hash, never the raw token", async () => {
      const result = await session.createSession({
        userId: "user-1",
        ttlMs: 86_400_000,
        ip: "127.0.0.1",
        userAgent: "vitest",
      });

      expect(result.refreshToken).toBeTruthy();
      expect(result.sid).toBeTruthy();
      // sid is the hash of the token
      const { createHash } = await import("node:crypto");
      const expectedHash = createHash("sha256")
        .update(result.refreshToken)
        .digest("hex");
      expect(result.sid).toBe(expectedHash);

      const saved = vi.mocked(refreshRepo.save).mock.calls[0][0] as RefreshSession;
      expect(saved.tokenHash).toBe(result.sid);
      expect(saved.tokenHash).not.toBe(result.refreshToken);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("rotate", () => {
    it("rotates a valid token and revokes the old session", async () => {
      const created = await session.createSession({ userId: "u1", ttlMs: 60_000 });
      const oldRow = {
        id: "sess-1",
        userId: "u1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedBySessionId: null,
        user: { id: "u1" },
      } as RefreshSession & { user: User };
      vi.mocked(refreshRepo.findOne).mockResolvedValue(oldRow);

      vi.mocked(userRepo.findOne).mockResolvedValue({
        id: "u1",
        email: "u@x.com",
        name: "U",
        status: "ACTIVE",
      } as User);
      vi.mocked(roleRepo.find).mockResolvedValue([]);

      const result = await session.rotate({
        refreshToken: created.refreshToken,
        ttlMs: 60_000,
      });

      expect(result.refreshToken).not.toBe(created.refreshToken);
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { id: "sess-1" },
        expect.objectContaining({
          revokedAt: expect.any(Date),
          replacedBySessionId: result.sid,
        }),
      );
    });

    it("revokes the whole family when an already-rotated token is reused", async () => {
      const real = new SessionService(refreshRepo, userRepo, roleRepo);
      const created = await real.createSession({ userId: "u1", ttlMs: 60_000 });

      const oldRow = {
        id: "sess-1",
        userId: "u1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(), // already rotated away
        replacedBySessionId: "sess-2",
        user: { id: "u1" },
      } as RefreshSession & { user: User };
      vi.mocked(refreshRepo.findOne).mockResolvedValue(oldRow);

      await expect(
        real.rotate({ refreshToken: created.refreshToken, ttlMs: 60_000 }),
      ).rejects.toThrow(ApiError);

      // everything still-live for this user is revoked (revokedAt IS NULL)
      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          revokedAt: expect.objectContaining({ _type: "isNull" }),
        }),
        { revokedAt: expect.any(Date) },
      );
    });

    it("throws TOKEN_EXPIRED for expired sessions", async () => {
      const created = await session.createSession({ userId: "u1", ttlMs: 60_000 });
      const oldRow = {
        id: "sess-1",
        userId: "u1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        replacedBySessionId: null,
        user: { id: "u1" },
      } as RefreshSession & { user: User };
      vi.mocked(refreshRepo.findOne).mockResolvedValue(oldRow);

      await expect(
        session.rotate({ refreshToken: created.refreshToken, ttlMs: 60_000 }),
      ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    });
  });

  describe("revoke", () => {
    it("marks the session revoked", async () => {
      await session.revoke("some-token");
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update("some-token").digest("hex");
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { tokenHash: hash },
        { revokedAt: expect.any(Date) },
      );
    });
  });

  describe("buildSessionUser", () => {
    it("derives tenantId from the non-SUPER_ADMIN role", async () => {
      vi.mocked(userRepo.findOne).mockResolvedValue({
        id: "u1",
        email: "owner@demo.salon",
        name: "Demo Owner",
        status: "ACTIVE",
      } as User);
      vi.mocked(roleRepo.find).mockResolvedValue([
        { userId: "u1", tenantId: "tenant-1", branchId: "branch-1", role: "OWNER" },
      ] as UserTenantRole[]);

      const result = await session.buildSessionUser("u1");
      expect(result.tenantId).toBe("tenant-1");
      expect(result.branchId).toBe("branch-1");
      expect(result.roles).toEqual(["OWNER"]);
    });

    it("merges the platform SUPER_ADMIN role from the user row (no tenant membership)", async () => {
      vi.mocked(userRepo.findOne).mockResolvedValue({
        id: "u2",
        email: "super.admin@salon.local",
        name: "Platform Admin",
        status: "ACTIVE",
        isSuperAdmin: true,
      } as User);
      vi.mocked(roleRepo.find).mockResolvedValue([]);

      const result = await session.buildSessionUser("u2");
      expect(result.tenantId).toBeNull();
      expect(result.branchId).toBeNull();
      expect(result.roles).toEqual(["SUPER_ADMIN"]);
    });
  });
});