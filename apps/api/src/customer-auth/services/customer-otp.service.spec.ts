import type { ObjectLiteral, Repository } from "typeorm";
import { createHash } from "node:crypto";
import { CustomerOtpService, SIGNUP_VERIFY_PURPOSE } from "./customer-otp.service";
import type { PhoneOtp } from "../../entities/phone-otp.entity";
import type { SmsNotificationProvider } from "../../notification/providers/sms.provider";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => e),
    findOne: vi.fn(async () => null as T | null),
    update: vi.fn(async () => undefined),
  } as unknown as Repository<T>;
}

function hashOf(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

describe("CustomerOtpService", () => {
  let otps: Repository<PhoneOtp>;
  let sms: SmsNotificationProvider;
  let service: CustomerOtpService;

  beforeEach(() => {
    otps = mockRepo<PhoneOtp>();
    sms = { send: vi.fn(async () => ({ providerMessageId: "msg-1" })) } as unknown as SmsNotificationProvider;
    service = new CustomerOtpService(otps, sms);
  });

  describe("send", () => {
    it("rejects an invalid phone number without ever calling the SMS provider", async () => {
      await expect(service.send("not-a-phone")).rejects.toMatchObject({
        statusCode: 422,
        code: "INVALID_PHONE_NUMBER",
      });
      expect(sms.send).not.toHaveBeenCalled();
    });

    it("stores only the code's hash and sends the raw code by SMS", async () => {
      await service.send("0771234567");

      const saved = vi.mocked(otps.save).mock.calls[0][0] as PhoneOtp;
      expect(saved.phone).toBe("94771234567");
      expect(saved.purpose).toBe(SIGNUP_VERIFY_PURPOSE);
      expect(saved.codeHash).toHaveLength(64); // sha256 hex

      const sent = vi.mocked(sms.send).mock.calls[0][0];
      expect(sent.recipient).toBe("94771234567");
      const rawCodeMatch = /code is (\d{6})\./.exec(sent.body);
      expect(rawCodeMatch).not.toBeNull();
      expect(saved.codeHash).toBe(hashOf(rawCodeMatch![1]));
    });
  });

  describe("verify", () => {
    function fakeOtp(overrides: Partial<PhoneOtp> = {}): PhoneOtp {
      return {
        id: "otp-1",
        phone: "94771234567",
        purpose: SIGNUP_VERIFY_PURPOSE,
        codeHash: hashOf("123456"),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
        ...overrides,
      } as PhoneOtp;
    }

    it("succeeds on the right code and marks it consumed", async () => {
      vi.mocked(otps.findOne).mockResolvedValue(fakeOtp());

      await service.verify("0771234567", "123456");

      expect(otps.update).toHaveBeenCalledWith("otp-1", { consumedAt: expect.any(Date) });
    });

    it("throws OTP_NOT_FOUND when there is no pending code", async () => {
      vi.mocked(otps.findOne).mockResolvedValue(null);
      await expect(service.verify("0771234567", "123456")).rejects.toMatchObject({ code: "OTP_NOT_FOUND" });
    });

    it("throws OTP_EXPIRED for an expired code", async () => {
      vi.mocked(otps.findOne).mockResolvedValue(fakeOtp({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.verify("0771234567", "123456")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    });

    it("increments attempts and rejects a wrong code, without consuming it", async () => {
      vi.mocked(otps.findOne).mockResolvedValue(fakeOtp({ attempts: 1 }));

      await expect(service.verify("0771234567", "000000")).rejects.toMatchObject({ code: "OTP_INCORRECT" });

      expect(otps.update).toHaveBeenCalledWith("otp-1", { attempts: 2 });
    });

    it("locks out after the attempt cap, refusing even the right code", async () => {
      vi.mocked(otps.findOne).mockResolvedValue(fakeOtp({ attempts: 5 }));
      await expect(service.verify("0771234567", "123456")).rejects.toMatchObject({
        statusCode: 429,
        code: "OTP_LOCKED",
      });
    });
  });
});
