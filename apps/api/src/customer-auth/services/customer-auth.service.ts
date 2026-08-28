import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ApiError, normalizeSriLankanPhone, type CustomerLoginDto, type CustomerSignupDto } from "@salon/shared";
import { CustomerAccount } from "../../entities/customer-account.entity";
// PasswordService/CustomerSessionService/CustomerTokenService/CustomerOtpService
// must stay VALUE imports: NestJS resolves constructor injection via
// design:paramtypes metadata at runtime; `import type` would erase them and
// break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PasswordService } from "../../auth/services/password.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerSessionService } from "./customer-session.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerTokenService } from "./customer-token.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerOtpService } from "./customer-otp.service";

export interface CustomerAuthResult {
  accessToken: string;
  refreshToken: string;
  account: PublicCustomerAccount;
}

export interface PublicCustomerAccount {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  phoneVerified: boolean;
}

/**
 * A platform-level account (DECISIONS.md) — deliberately separate from the
 * existing staff `AuthService`: no tenant, no roles, and a session is issued
 * at OTP-verification time for a brand-new account, not at signup. Guest
 * booking (phone + reference code) is entirely unaffected by any of this.
 */
@Injectable()
export class CustomerAuthService {
  constructor(
    @InjectRepository(CustomerAccount) private readonly accounts: Repository<CustomerAccount>,
    private readonly password: PasswordService,
    private readonly sessions: CustomerSessionService,
    private readonly tokens: CustomerTokenService,
    private readonly otp: CustomerOtpService,
  ) {}

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

  /** No session yet — the natural next step is verifying the phone, which is what actually logs a new account in. */
  async signup(dto: CustomerSignupDto): Promise<{ account: PublicCustomerAccount }> {
    const phone = this.normalizedPhone(dto.phone);
    const existing = await this.accounts.findOne({ where: { phone } });
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: "ACCOUNT_EXISTS",
        message: "An account with this phone number already exists. Log in instead.",
      });
    }

    const passwordHash = await this.password.hash(dto.password);
    const account = await this.accounts.save(
      this.accounts.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email.toLowerCase(),
        passwordHash,
        phoneVerifiedAt: null,
        termsAcceptedAt: new Date(),
      }),
    );

    return { account: toPublicAccount(account) };
  }

  /**
   * Phone + password — a returning customer on a new device/browser. Always
   * issues a session regardless of verification state; `phoneVerified` in
   * the response is what gates the "Book it" button, not this endpoint.
   */
  async login(dto: CustomerLoginDto, ip?: string, userAgent?: string): Promise<CustomerAuthResult> {
    const phone = this.normalizedPhone(dto.phone);
    const account = await this.accounts.findOne({ where: { phone } });
    if (!account || !(await this.password.verify(account.passwordHash, dto.password))) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Phone number or password is incorrect.",
      });
    }
    return this.issueSession(account, ip, userAgent);
  }

  /** The moment a first-time signup actually becomes "logged in" (Uber/PickMe-style). */
  async verifyPhoneAndLogIn(
    phoneRaw: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<CustomerAuthResult> {
    await this.otp.verify(phoneRaw, code);
    const phone = this.normalizedPhone(phoneRaw);
    const account = await this.accounts.findOne({ where: { phone } });
    if (!account) {
      throw new ApiError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "No account exists for this number yet. Sign up first.",
      });
    }
    if (!account.phoneVerifiedAt) {
      account.phoneVerifiedAt = new Date();
      await this.accounts.update(account.id, { phoneVerifiedAt: account.phoneVerifiedAt });
    }
    return this.issueSession(account, ip, userAgent);
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<CustomerAuthResult> {
    const rotated = await this.sessions.rotate({ refreshToken, ip, userAgent, ttlMs: refreshTtlMs() });
    return {
      accessToken: await this.tokens.sign(claimsOf(rotated.account)),
      refreshToken: rotated.refreshToken,
      account: toPublicAccount(rotated.account),
    };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.sessions.revoke(refreshToken);
    }
  }

  private async issueSession(
    account: CustomerAccount,
    ip?: string,
    userAgent?: string,
  ): Promise<CustomerAuthResult> {
    const session = await this.sessions.createSession({
      customerAccountId: account.id,
      ip,
      userAgent,
      ttlMs: refreshTtlMs(),
    });
    return {
      accessToken: await this.tokens.sign(claimsOf(account)),
      refreshToken: session.refreshToken,
      account: toPublicAccount(account),
    };
  }
}

function toPublicAccount(account: CustomerAccount): PublicCustomerAccount {
  return {
    id: account.id,
    firstName: account.firstName,
    lastName: account.lastName,
    phone: account.phone,
    email: account.email,
    phoneVerified: account.phoneVerifiedAt !== null,
  };
}

function claimsOf(account: CustomerAccount) {
  return {
    customerAccountId: account.id,
    phone: account.phone,
    phoneVerified: account.phoneVerifiedAt !== null,
  };
}

/** Same parsing as `auth/services/auth.service.ts` — duplicated rather than shared, matching this module's independence from the staff auth module's internals. */
function refreshTtlMs(): number {
  const ttl = process.env.JWT_REFRESH_TTL ?? "7d";
  const m = /^(\d+)([smhd])$/.exec(ttl);
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const n = m ? Number(m[1]) : 7;
  const u = m ? m[2] : "d";
  return n * mult[u];
}
