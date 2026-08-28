import type { ObjectLiteral, Repository } from "typeorm";
import { CustomerAuthService } from "./customer-auth.service";
import type { CustomerAccount } from "../../entities/customer-account.entity";
import type { PasswordService } from "../../auth/services/password.service";
import type { CustomerSessionService } from "./customer-session.service";
import type { CustomerTokenService } from "./customer-token.service";
import type { CustomerOtpService } from "./customer-otp.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "acct-1", ...e }) as T),
    findOne: vi.fn(async () => null as T | null),
    update: vi.fn(async () => undefined),
  } as unknown as Repository<T>;
}

function fakeAccount(overrides: Partial<CustomerAccount> = {}): CustomerAccount {
  return {
    id: "acct-1",
    firstName: "Sanduni",
    lastName: "Fernando",
    phone: "94771234567",
    email: "sanduni@example.com",
    passwordHash: "hashed",
    phoneVerifiedAt: null,
    termsAcceptedAt: new Date(),
    ...overrides,
  } as CustomerAccount;
}

describe("CustomerAuthService", () => {
  let accounts: Repository<CustomerAccount>;
  let password: PasswordService;
  let sessions: CustomerSessionService;
  let tokens: CustomerTokenService;
  let otp: CustomerOtpService;
  let service: CustomerAuthService;

  beforeEach(() => {
    accounts = mockRepo<CustomerAccount>();
    password = {
      hash: vi.fn(async () => "hashed-password"),
      verify: vi.fn(async () => true),
    } as unknown as PasswordService;
    sessions = {
      createSession: vi.fn(async () => ({ refreshToken: "raw-refresh", sid: "sid-1" })),
      rotate: vi.fn(),
      revoke: vi.fn(async () => undefined),
    } as unknown as CustomerSessionService;
    tokens = { sign: vi.fn(async () => "signed-access-token") } as unknown as CustomerTokenService;
    otp = { verify: vi.fn(async () => undefined) } as unknown as CustomerOtpService;
    service = new CustomerAuthService(accounts, password, sessions, tokens, otp);
  });

  describe("signup", () => {
    it("normalizes the phone, hashes the password, and issues no session yet", async () => {
      const result = await service.signup({
        firstName: "Sanduni",
        lastName: "Fernando",
        phone: "0771234567",
        email: "Sanduni@Example.com",
        password: "correct horse",
        termsAccepted: true,
      });

      expect(password.hash).toHaveBeenCalledWith("correct horse");
      const saved = vi.mocked(accounts.save).mock.calls[0][0] as CustomerAccount;
      expect(saved.phone).toBe("94771234567");
      expect(saved.email).toBe("sanduni@example.com");
      expect(saved.phoneVerifiedAt).toBeNull();
      expect(result.account.phoneVerified).toBe(false);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it("rejects a phone already in use", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(fakeAccount());
      await expect(
        service.signup({
          firstName: "A",
          lastName: "B",
          phone: "0771234567",
          email: "a@x.com",
          password: "correct horse",
          termsAccepted: true,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ACCOUNT_EXISTS" });
    });

    it("rejects an invalid phone number", async () => {
      await expect(
        service.signup({
          firstName: "A",
          lastName: "B",
          phone: "123",
          email: "a@x.com",
          password: "correct horse",
          termsAccepted: true,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: "INVALID_PHONE_NUMBER" });
    });
  });

  describe("login", () => {
    it("issues a session on correct credentials, regardless of verification state", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(fakeAccount({ phoneVerifiedAt: null }));

      const result = await service.login({ phone: "0771234567", password: "correct horse" });

      expect(result.accessToken).toBe("signed-access-token");
      expect(result.refreshToken).toBe("raw-refresh");
      expect(result.account.phoneVerified).toBe(false);
    });

    it("rejects a wrong password without revealing which part was wrong", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(fakeAccount());
      vi.mocked(password.verify).mockResolvedValue(false);

      await expect(service.login({ phone: "0771234567", password: "wrong" })).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
    });

    it("rejects a phone with no account, same error as a wrong password", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(null);
      await expect(service.login({ phone: "0771234567", password: "whatever" })).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
    });
  });

  describe("verifyPhoneAndLogIn", () => {
    it("marks the phone verified on first success and issues a session", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(fakeAccount({ phoneVerifiedAt: null }));

      const result = await service.verifyPhoneAndLogIn("0771234567", "123456");

      expect(otp.verify).toHaveBeenCalledWith("0771234567", "123456");
      expect(accounts.update).toHaveBeenCalledWith("acct-1", { phoneVerifiedAt: expect.any(Date) });
      expect(result.account.phoneVerified).toBe(true);
    });

    it("does not re-touch phoneVerifiedAt for an already-verified account", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(fakeAccount({ phoneVerifiedAt: new Date("2026-01-01") }));

      await service.verifyPhoneAndLogIn("0771234567", "123456");

      expect(accounts.update).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND if the phone verified but no account exists for it", async () => {
      vi.mocked(accounts.findOne).mockResolvedValue(null);
      await expect(service.verifyPhoneAndLogIn("0771234567", "123456")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("refresh / logout", () => {
    it("refresh delegates to CustomerSessionService.rotate and re-signs a token", async () => {
      vi.mocked(sessions.rotate).mockResolvedValue({
        account: fakeAccount(),
        sid: "sid-2",
        refreshToken: "rotated-refresh",
      });

      const result = await service.refresh("old-refresh");

      expect(sessions.rotate).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: "old-refresh" }),
      );
      expect(result.refreshToken).toBe("rotated-refresh");
    });

    it("logout revokes the given refresh token", async () => {
      await service.logout("some-token");
      expect(sessions.revoke).toHaveBeenCalledWith("some-token");
    });

    it("logout is a no-op with no token", async () => {
      await service.logout(undefined);
      expect(sessions.revoke).not.toHaveBeenCalled();
    });
  });
});
