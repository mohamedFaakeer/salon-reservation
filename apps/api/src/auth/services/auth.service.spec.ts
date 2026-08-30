import type { ObjectLiteral, Repository } from "typeorm";
import { AuthService } from "./auth.service";
import type { PasswordService } from "./password.service";
import type { SessionService } from "./session.service";
import type { TokenService } from "./token.service";
import type { AuditService } from "../../audit/audit.service";
import type { User } from "../../entities/user.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    findOne: vi.fn(),
    update: vi.fn(async () => undefined),
  } as unknown as Repository<T>;
}

function mockAudit(): AuditService {
  return {
    record: vi.fn(async () => undefined),
    // Not locked by default — every test that doesn't care about the
    // unknown-email fallback exercises this path regardless.
    lockoutExpiry: vi.fn(async () => null as Date | null),
  } as unknown as AuditService;
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "owner@elegance.salon",
    name: "Nadeesha",
    passwordHash: "hashed",
    status: "ACTIVE",
    failedLoginAttempts: 0,
    mustChangePassword: false,
    lastLoginAt: null,
    ...overrides,
  } as User;
}

describe("AuthService.login — audit trail", () => {
  let users: Repository<User>;
  let password: PasswordService;
  let sessions: SessionService;
  let tokens: TokenService;
  let audit: AuditService;
  let service: AuthService;

  beforeEach(() => {
    users = mockRepo<User>();
    password = { verify: vi.fn(async () => true), hash: vi.fn(async (p: string) => `hashed:${p}`) } as unknown as PasswordService;
    sessions = {
      buildSessionUser: vi.fn(async () => ({
        userId: "user-1",
        email: "owner@elegance.salon",
        name: "Nadeesha",
        tenantId: "tenant-1",
        roles: ["OWNER"],
        branchId: null,
      })),
      createSession: vi.fn(async () => ({ refreshToken: "raw-refresh", sid: "sid-1" })),
      revokeAllForUser: vi.fn(async () => undefined),
      primaryTenantId: vi.fn(async () => "tenant-1"),
    } as unknown as SessionService;
    tokens = {
      sign: vi.fn(async () => "signed-access-token"),
      signPasswordChangeToken: vi.fn(async () => "signed-change-token"),
      verifyPasswordChangeToken: vi.fn(async () => ({ userId: "user-1", passwordHashFingerprint: "fp" })),
    } as unknown as TokenService;
    audit = mockAudit();
    service = new AuthService(users, password, sessions, tokens, audit);
  });

  it("audits LOGIN_SUCCEEDED with the resolved tenant on success", async () => {
    vi.mocked(users.findOne).mockResolvedValue(fakeUser());

    await service.login({ email: "owner@elegance.salon", password: "correct horse" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCEEDED", actorUserId: "user-1", tenantId: "tenant-1" }),
    );
  });

  it("resets failedLoginAttempts to 0 on a successful login", async () => {
    vi.mocked(users.findOne).mockResolvedValue(fakeUser({ failedLoginAttempts: 3 }));

    await service.login({ email: "owner@elegance.salon", password: "correct horse" });

    expect(users.update).toHaveBeenCalledWith(
      { id: "user-1" },
      expect.objectContaining({ failedLoginAttempts: 0 }),
    );
  });

  it("audits LOGIN_FAILED with the user's id when the password is wrong", async () => {
    vi.mocked(users.findOne).mockResolvedValue(fakeUser());
    vi.mocked(password.verify).mockResolvedValue(false);

    await expect(
      service.login({ email: "owner@elegance.salon", password: "wrong" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_FAILED", actorUserId: "user-1" }),
    );
  });

  it("audits LOGIN_FAILED with the attempted email when no account exists, without revealing that distinction to the caller", async () => {
    vi.mocked(users.findOne).mockResolvedValue(null);

    await expect(
      service.login({ email: "nobody@elegance.salon", password: "whatever" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        actorUserId: null,
        metadata: { attemptedEmail: "nobody@elegance.salon" },
      }),
    );
  });

  describe("account lockout (persisted, manual-reset — DECISIONS.md)", () => {
    it("rejects immediately with ACCOUNT_LOCKED when the account's status is already LOCKED, before verifying the password", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ status: "LOCKED" as User["status"] }));

      await expect(
        service.login({ email: "owner@elegance.salon", password: "correct horse" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_LOCKED" });

      expect(password.verify).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("increments failedLoginAttempts on a wrong password without locking, below the threshold", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ failedLoginAttempts: 2 }));
      vi.mocked(password.verify).mockResolvedValue(false);

      await expect(service.login({ email: "owner@elegance.salon", password: "wrong" })).rejects.toBeDefined();

      expect(users.update).toHaveBeenCalledWith({ id: "user-1" }, { failedLoginAttempts: 3 });
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("locks the account, revokes its sessions, and audits ACCOUNT_LOCKED on the 5th consecutive wrong password", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ failedLoginAttempts: 4 }));
      vi.mocked(password.verify).mockResolvedValue(false);

      await expect(service.login({ email: "owner@elegance.salon", password: "wrong" })).rejects.toBeDefined();

      expect(users.update).toHaveBeenCalledWith(
        { id: "user-1" },
        { failedLoginAttempts: 5, status: "LOCKED" },
      );
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith("user-1");
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ACCOUNT_LOCKED",
          entityId: "user-1",
          tenantId: "tenant-1",
          metadata: { failedLoginAttempts: 5 },
        }),
      );
    });

    it("falls back to the audit-log sliding window for an unknown email — same enumeration-resistance the old mechanism had", async () => {
      vi.mocked(users.findOne).mockResolvedValue(null);
      const lockedUntil = new Date(Date.now() + 7 * 60_000);
      vi.mocked(audit.lockoutExpiry).mockResolvedValueOnce(lockedUntil);

      await expect(
        service.login({ email: "nobody@elegance.salon", password: "whatever" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_LOCKED" });

      expect(audit.lockoutExpiry).toHaveBeenCalledWith(
        "nobody@elegance.salon",
        "LOGIN_FAILED",
        "LOGIN_SUCCEEDED",
        5,
        15 * 60_000,
      );
    });

    it("shows the identical ACCOUNT_LOCKED shape for an unknown email as for a real locked account", async () => {
      vi.mocked(users.findOne).mockResolvedValue(null);
      vi.mocked(audit.lockoutExpiry).mockResolvedValueOnce(new Date(Date.now() + 60_000));

      await expect(
        service.login({ email: "nobody@elegance.salon", password: "whatever" }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "ACCOUNT_LOCKED",
        message: "Too many incorrect attempts. Your account is locked. Ask your manager, salon owner, or platform admin to unlock it.",
      });
    });
  });

  describe("forced first-login password change", () => {
    it("returns a change-token instead of a session when mustChangePassword is set, without recording LOGIN_SUCCEEDED", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ mustChangePassword: true }));

      const result = await service.login({ email: "owner@elegance.salon", password: "temp-pass-123" });

      expect(result).toEqual({ requiresPasswordChange: true, changeToken: "signed-change-token" });
      expect(sessions.createSession).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN_SUCCEEDED" }));
    });

    it("signs the change-token with a fingerprint of the current password hash", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ mustChangePassword: true, passwordHash: "hashed" }));

      await service.login({ email: "owner@elegance.salon", password: "temp-pass-123" });

      expect(tokens.signPasswordChangeToken).toHaveBeenCalledWith("user-1", expect.any(String));
    });
  });

  describe("completeFirstLogin", () => {
    it("rejects an invalid or expired change-token", async () => {
      vi.mocked(tokens.verifyPasswordChangeToken).mockRejectedValueOnce(new Error("expired"));

      await expect(
        service.completeFirstLogin({ changeToken: "bad", newPassword: "new-password-123" }),
      ).rejects.toMatchObject({ statusCode: 401, code: "TOKEN_INVALID" });
    });

    it("rejects when the account no longer needs a password change (already redeemed, or reset again since)", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ mustChangePassword: false }));

      await expect(
        service.completeFirstLogin({ changeToken: "signed-change-token", newPassword: "new-password-123" }),
      ).rejects.toMatchObject({ statusCode: 401, code: "TOKEN_INVALID" });
    });

    it("rejects when the password hash has changed since the token was issued (replay protection)", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser({ mustChangePassword: true, passwordHash: "a-different-hash-now" }));
      vi.mocked(tokens.verifyPasswordChangeToken).mockResolvedValueOnce({
        userId: "user-1",
        passwordHashFingerprint: "fingerprint-of-the-old-hash",
      });

      await expect(
        service.completeFirstLogin({ changeToken: "signed-change-token", newPassword: "new-password-123" }),
      ).rejects.toMatchObject({ statusCode: 401, code: "TOKEN_INVALID" });
    });

    it("sets the new password, clears mustChangePassword, and issues a real session on success", async () => {
      const user = fakeUser({ mustChangePassword: true, passwordHash: "hashed" });
      vi.mocked(users.findOne).mockResolvedValue(user);
      const fingerprint = (service as unknown as { fingerprint: (h: string) => string }).fingerprint("hashed");
      vi.mocked(tokens.verifyPasswordChangeToken).mockResolvedValueOnce({
        userId: "user-1",
        passwordHashFingerprint: fingerprint,
      });

      const result = await service.completeFirstLogin({
        changeToken: "signed-change-token",
        newPassword: "new-password-123",
      });

      expect(users.update).toHaveBeenCalledWith(
        { id: "user-1" },
        expect.objectContaining({ passwordHash: "hashed:new-password-123", mustChangePassword: false }),
      );
      expect("accessToken" in result && result.accessToken).toBe("signed-access-token");
    });
  });
});
