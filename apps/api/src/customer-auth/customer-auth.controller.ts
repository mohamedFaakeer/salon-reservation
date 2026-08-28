import { Body, Controller, Inject, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
// DTOs must stay VALUE imports: NestJS ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CustomerLoginDto,
  CustomerLogoutDto,
  CustomerRefreshTokenDto,
  CustomerSignupDto,
  SendPhoneOtpDto,
  VerifyPhoneOtpDto,
} from "@salon/shared";
import { ApiError } from "@salon/shared";
import { Public } from "../common/decorators/public.decorator";
import { CustomerAuthService } from "./services/customer-auth.service";
import { CustomerOtpService, SIGNUP_VERIFY_PURPOSE } from "./services/customer-otp.service";

/**
 * Customer-account endpoints (DECISIONS.md) — entirely optional alongside
 * guest booking (phone + reference code), which none of this touches.
 * Same shape as `AuthController`: access token in the body, refresh token
 * both as an httpOnly cookie and in the body (a cross-origin apps/web can't
 * rely on a SameSite cookie reaching it, same reasoning as `RefreshTokenDto`).
 */
@Controller("customer-auth")
@Public()
export class CustomerAuthController {
  constructor(
    @Inject(CustomerAuthService) private readonly auth: CustomerAuthService,
    @Inject(CustomerOtpService) private readonly otp: CustomerOtpService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private get cookieName(): string {
    return this.config.get<string>("CUSTOMER_AUTH_COOKIE_NAME", "salon_customer_session");
  }

  private get cookieOptions() {
    const nodeEnv = process.env.NODE_ENV;
    return {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: nodeEnv === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Post("signup")
  signup(@Body() dto: CustomerSignupDto) {
    return this.auth.signup(dto);
  }

  @Post("otp/send")
  async sendOtp(@Body() dto: SendPhoneOtpDto) {
    await this.otp.send(dto.phone, SIGNUP_VERIFY_PURPOSE);
    return { ok: true };
  }

  @Post("otp/verify")
  async verifyOtp(
    @Body() dto: VerifyPhoneOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyPhoneAndLogIn(dto.phone, dto.code, req.ip, req.get("user-agent"));
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return result;
  }

  @Post("login")
  async login(
    @Body() dto: CustomerLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req.ip, req.get("user-agent"));
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return result;
  }

  @Post("refresh")
  async refresh(
    @Body() dto: CustomerRefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies?.[this.cookieName] as string | undefined) ?? dto.refreshToken;
    if (!token) {
      throw new ApiError({ statusCode: 401, code: "UNAUTHENTICATED", message: "Missing refresh token." });
    }
    const result = await this.auth.refresh(token, req.ip, req.get("user-agent"));
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return result;
  }

  @Post("logout")
  async logout(
    @Body() dto: CustomerLogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies?.[this.cookieName] as string | undefined) ?? dto.refreshToken;
    await this.auth.logout(token);
    res.clearCookie(this.cookieName, { path: "/" });
    return { ok: true };
  }
}
