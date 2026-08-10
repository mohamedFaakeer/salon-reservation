import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ApiError } from "@salon/shared";
import { TokenService } from "../../auth/services/token.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Global auth guard. Apply @Public() to bypass. Missing/invalid bearer
 * tokens are rejected with a uniform 401 envelope (SECURITY.md §4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Missing bearer token.",
      });
    }

    try {
      const payload = await this.tokens.verify(token);
      (req as Request & { user: unknown }).user = payload;
      return true;
    } catch {
      throw new ApiError({
        statusCode: 401,
        code: "TOKEN_INVALID",
        message: "Your session has expired. Please sign in again.",
      });
    }
  }
}