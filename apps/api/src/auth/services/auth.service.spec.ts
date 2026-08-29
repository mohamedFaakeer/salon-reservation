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
    // Not locked by default — every existing login test exercises this path
    // whether or not it cares about lockout, so "not currently locked" has
    // to be the harmless default.
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
    password = { verify: vi.fn(async () => true) } as unknown as PasswordService;
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
    } as unknown as SessionService;
    tokens = { sign: vi.fn(async () => "signed-access-token") } as unknown as TokenService;
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

  describe("account lockout", () => {
    it("checks lockout on the user's own id, before ever verifying the password", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser());

      await service.login({ email: "owner@elegance.salon", password: "correct horse" });

      expect(audit.lockoutExpiry).toHaveBeenCalledWith(
        "user-1",
        "LOGIN_FAILED",
        "LOGIN_SUCCEEDED",
        5,
        15 * 60_000,
      );
    });

    it("checks lockout on the attempted email when no account exists — same as LOGIN_FAILED's own entityId convention", async () => {
      vi.mocked(users.findOne).mockResolvedValue(null);

      await expect(service.login({ email: "nobody@elegance.salon", password: "whatever" })).rejects.toBeDefined();

      expect(audit.lockoutExpiry).toHaveBeenCalledWith(
        "nobody@elegance.salon",
        "LOGIN_FAILED",
        "LOGIN_SUCCEEDED",
        5,
        15 * 60_000,
      );
    });

    it("rejects with ACCOUNT_TEMPORARILY_LOCKED before checking the password at all, when locked", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser());
      const lockedUntil = new Date(Date.now() + 7 * 60_000);
      vi.mocked(audit.lockoutExpiry).mockResolvedValueOnce(lockedUntil);

      await expect(
        service.login({ email: "owner@elegance.salon", password: "correct horse" }),
      ).rejects.toMatchObject({ statusCode: 429, code: "ACCOUNT_TEMPORARILY_LOCKED" });

      expect(password.verify).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("states the wait time, rounded up to the nearest whole minute", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser());
      vi.mocked(audit.lockoutExpiry).mockResolvedValueOnce(new Date(Date.now() + 61_000)); // 1m01s left

      await expect(
        service.login({ email: "owner@elegance.salon", password: "correct horse" }),
      ).rejects.toMatchObject({ message: "Too many incorrect attempts. Try again in 2 minutes." });
    });

    it("lets a genuinely correct login through once the lockout has lifted", async () => {
      vi.mocked(users.findOne).mockResolvedValue(fakeUser());
      vi.mocked(audit.lockoutExpiry).mockResolvedValueOnce(null);

      await expect(
        service.login({ email: "owner@elegance.salon", password: "correct horse" }),
      ).resolves.toBeDefined();
    });
  });
});
