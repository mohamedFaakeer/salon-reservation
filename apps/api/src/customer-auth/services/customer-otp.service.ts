import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomInt } from "node:crypto";
import type { Repository } from "typeorm";
import { IsNull } from "typeorm";
import { ApiError, normalizeSriLankanPhone } from "@salon/shared";
import { PhoneOtp } from "../../entities/phone-otp.entity";
// SmsNotificationProvider must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SmsNotificationProvider } from "../../notification/providers/sms.provider";

const CODE_TTL_MS = 5 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

export const SIGNUP_VERIFY_PURPOSE = "SIGNUP_VERIFY";

/**
 * Phone verification by one-time SMS code — the Uber/PickMe-style flow
 * (DECISIONS.md). Sends through the same Text.lk connection notifications
 * already use; nothing new to configure. Only the code's hash is ever
 * stored (same policy as a refresh token) so a database dump can't be used
 * to complete anyone's verification.
 */
@Injectable()
export class CustomerOtpService {
  constructor(
    @InjectRepository(PhoneOtp) private readonly otps: Repository<PhoneOtp>,
    private readonly sms: SmsNotificationProvider,
  ) {}

  private hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }

  private normalizedPhone(raw: string): string {
    const phone = normalizeSriLankanPhone(raw);
    if (!phone) {
      throw new ApiError({
        statusCode: 422,
        code: "INVALID_PHONE_NUMBER",
        message: `"${raw}" is not a valid Sri Lankan mobile number.`,
      });
    }
    return phone;
  }

  async send(phoneRaw: string, purpose: string = SIGNUP_VERIFY_PURPOSE): Promise<void> {
    const phone = this.normalizedPhone(phoneRaw);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

    await this.otps.save(
      this.otps.create({
        phone,
        purpose,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        attempts: 0,
        consumedAt: null,
      }),
    );

    await this.sms.send({
      recipient: phone,
      subject: "Verification code",
      body: `Your Salon Reservation verification code is ${code}. It expires in 5 minutes.`,
    });
  }

  async verify(phoneRaw: string, code: string, purpose: string = SIGNUP_VERIFY_PURPOSE): Promise<void> {
    const phone = this.normalizedPhone(phoneRaw);
    const otp = await this.otps.findOne({
      where: { phone, purpose, consumedAt: IsNull() },
      order: { createdAt: "DESC" },
    });

    if (!otp) {
      throw new ApiError({
        statusCode: 400,
        code: "OTP_NOT_FOUND",
        message: "No pending code for this number. Request a new one.",
      });
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      throw new ApiError({
        statusCode: 400,
        code: "OTP_EXPIRED",
        message: "That code has expired. Request a new one.",
      });
    }
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new ApiError({
        statusCode: 429,
        code: "OTP_LOCKED",
        message: "Too many incorrect attempts. Request a new code.",
      });
    }

    if (this.hashCode(code) !== otp.codeHash) {
      await this.otps.update(otp.id, { attempts: otp.attempts + 1 });
      throw new ApiError({
        statusCode: 400,
        code: "OTP_INCORRECT",
        message: "That code isn't right. Please try again.",
      });
    }

    await this.otps.update(otp.id, { consumedAt: new Date() });
  }
}
