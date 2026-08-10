import { Body, Controller, Inject, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
// DTOs must stay VALUE imports: NestJS ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto, LogoutDto, RefreshTokenDto } from "@salon/shared";
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

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, req.ip, req.get("user-agent"));
    res.cookie(this.cookieName, result.refreshToken, this.cookieOptions);
    return { accessToken: result.accessToken, user: result.user };
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