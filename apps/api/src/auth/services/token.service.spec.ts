import type { ConfigService } from "@nestjs/config";
import { TokenService } from "./token.service";
import type { SessionUser } from "./session.service";

function mockConfig(values: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    JWT_SECRET: "a-test-secret-that-is-at-least-32-characters-long",
    ...values,
  };
  return {
    get: vi.fn((key: string, fallback?: string) => defaults[key] ?? fallback),
  } as unknown as ConfigService;
}

const sessionUser: SessionUser = {
  userId: "user-1",
  email: "owner@elegance.salon",
  name: "Nadeesha",
  tenantId: "tenant-1",
  roles: ["OWNER" as SessionUser["roles"][number]],
  branchId: null,
};

describe("TokenService", () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService(mockConfig());
  });

  describe("sign / verify (real access tokens)", () => {
    it("round-trips the session user's claims", async () => {
      const token = await service.sign(sessionUser);
      const payload = await service.verify(token);

      expect(payload).toMatchObject({
        sub: "user-1",
        email: "owner@elegance.salon",
        tenantId: "tenant-1",
        roles: ["OWNER"],
      });
    });
  });

  describe("password-change tokens (forced first-login change — DECISIONS.md)", () => {
    it("round-trips the userId and fingerprint", async () => {
      const token = await service.signPasswordChangeToken("user-1", "fingerprint-abc");
      const claim = await service.verifyPasswordChangeToken(token);

      expect(claim).toEqual({ userId: "user-1", passwordHashFingerprint: "fingerprint-abc" });
    });

    it("is rejected by verify() — a password-change token must never work as a real access token", async () => {
      const token = await service.signPasswordChangeToken("user-1", "fingerprint-abc");

      await expect(service.verify(token)).rejects.toThrow();
    });

    it("verifyPasswordChangeToken rejects a real access token", async () => {
      const token = await service.sign(sessionUser);

      await expect(service.verifyPasswordChangeToken(token)).rejects.toThrow();
    });
  });
});
