import { Body, Controller, Inject, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
// DTOs must stay VALUE imports: NestJS ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CompleteFirstLoginDto, LoginDto, LogoutDto, RefreshTokenDto } from "@salon/shared";
import type { AuthResult } from "./services/auth.service";
import { ApiError } from "@salon/shared";
import { Public } from "../common/decorators/public.decorator";
import { AuthService } from "./services/auth.service";

/**
 * Auth endpoints (API.md §6).
 *  - access token: returned in the body (used by Next.js SSR)
 *  - refresh token: set as an HttpOnly cookie, also accepted in body
 *  - rotation happens on every refresh; old token is revoked server-side
 */
@Controller("auth")
@Public()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private get cookieName(): string {
    return this.config.get<string>("AUTH_COOKIE_NAME", "salon_session");
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

  /** Sets the refresh-token cookie and shapes the body — shared by `login` and `complete-first-login`, which both end the same way once a real session exists. */
  private respondWithSession(result: AuthResult, res: Response) {
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req.ip, req.get("user-agent"));
    if ("requiresPasswordChange" in result) {
      // No cookie, no tokens — zero functional access until the password
      // is actually changed (DECISIONS.md).
      return result;
    }
    return this.respondWithSession(result, res);
  }

  @Post("complete-first-login")
  async completeFirstLogin(
    @Body() dto: CompleteFirstLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.completeFirstLogin(dto, req.ip, req.get("user-agent"));
    return this.respondWithSession(result, res);
  }

  @Post("refresh")
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies?.[this.cookieName] as string | undefined) ??
      dto.refreshToken;
    if (!token) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Missing refresh token.",
      });
    }
    const result = await this.auth.refresh(token, req.ip, req.get("user-agent"));
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post("logout")
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies?.[this.cookieName] as string | undefined) ??
      dto.refreshToken;
    await this.auth.logout(token);
    res.clearCookie(this.cookieName, { path: "/" });
    return { ok: true };
  }
}