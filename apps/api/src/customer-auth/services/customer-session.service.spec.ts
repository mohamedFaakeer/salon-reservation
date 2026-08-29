import type { ObjectLiteral, Repository } from "typeorm";
import { ApiError } from "@salon/shared";
import { CustomerSessionService } from "./customer-session.service";
import type { AuditService } from "../../audit/audit.service";
import type { CustomerRefreshSession } from "../../entities/customer-refresh-session.entity";
import type { CustomerAccount } from "../../entities/customer-account.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as Repository<T>;
}

function mockAudit(): AuditService {
  return { record: vi.fn(async () => undefined) } as unknown as AuditService;
}

describe("CustomerSessionService", () => {
  let refreshRepo: Repository<CustomerRefreshSession>;
  let audit: AuditService;
  let session: CustomerSessionService;

  beforeEach(() => {
    refreshRepo = mockRepo<CustomerRefreshSession>();
    audit = mockAudit();
    session = new CustomerSessionService(refreshRepo, audit);
  });

  describe("createSession", () => {
    it("stores only the SHA-256 hash, never the raw token", async () => {
      const result = await session.createSession({ customerAccountId: "acct-1", ttlMs: 86_400_000 });

      const { createHash } = await import("node:crypto");
      const expectedHash = createHash("sha256").update(result.refreshToken).digest("hex");
      expect(result.sid).toBe(expectedHash);

      const saved = vi.mocked(refreshRepo.save).mock.calls[0][0] as CustomerRefreshSession;
      expect(saved.tokenHash).toBe(result.sid);
      expect(saved.tokenHash).not.toBe(result.refreshToken);
    });
  });

  describe("rotate", () => {
    it("rotates a valid token and revokes the old session", async () => {
      const created = await session.createSession({ customerAccountId: "acct-1", ttlMs: 60_000 });
      vi.mocked(refreshRepo.findOne).mockResolvedValue({
        id: "sess-1",
        customerAccountId: "acct-1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedBySessionId: null,
        customerAccount: { id: "acct-1" },
      } as CustomerRefreshSession & { customerAccount: CustomerAccount });

      const result = await session.rotate({ refreshToken: created.refreshToken, ttlMs: 60_000 });

      expect(result.refreshToken).not.toBe(created.refreshToken);
      expect(result.account.id).toBe("acct-1");
      expect(refreshRepo.update).toHaveBeenCalledWith(
        { id: "sess-1" },
        expect.objectContaining({ revokedAt: expect.any(Date), replacedBySessionId: result.sid }),
      );
    });

    it("revokes the whole family when an already-rotated token is reused", async () => {
      const created = await session.createSession({ customerAccountId: "acct-1", ttlMs: 60_000 });
      vi.mocked(refreshRepo.findOne).mockResolvedValue({
        id: "sess-1",
        customerAccountId: "acct-1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(), // already rotated away
        replacedBySessionId: "sess-2",
        customerAccount: { id: "acct-1" },
      } as CustomerRefreshSession & { customerAccount: CustomerAccount });

      await expect(session.rotate({ refreshToken: created.refreshToken, ttlMs: 60_000 })).rejects.toThrow(ApiError);

      expect(refreshRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ customerAccountId: "acct-1", revokedAt: expect.objectContaining({ _type: "isNull" }) }),
        { revokedAt: expect.any(Date) },
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_TOKEN_REUSE_DETECTED" }),
      );
    });

    it("throws TOKEN_EXPIRED for an expired session", async () => {
      const created = await session.createSession({ customerAccountId: "acct-1", ttlMs: 60_000 });
      vi.mocked(refreshRepo.findOne).mockResolvedValue({
        id: "sess-1",
        customerAccountId: "acct-1",
        tokenHash: created.sid,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        replacedBySessionId: null,
        customerAccount: { id: "acct-1" },
      } as CustomerRefreshSession & { customerAccount: CustomerAccount });

      await expect(session.rotate({ refreshToken: created.refreshToken, ttlMs: 60_000 })).rejects.toMatchObject({
        code: "TOKEN_EXPIRED",
      });
    });

    it("throws UNAUTHENTICATED for an unknown token", async () => {
      vi.mocked(refreshRepo.findOne).mockResolvedValue(null);
      await expect(session.rotate({ refreshToken: "nope", ttlMs: 60_000 })).rejects.toMatchObject({
        statusCode: 401,
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("revoke", () => {
    it("marks the session revoked", async () => {
      await session.revoke("some-token");
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update("some-token").digest("hex");
      expect(refreshRepo.update).toHaveBeenCalledWith({ tokenHash: hash }, { revokedAt: expect.any(Date) });
    });
  });
});
