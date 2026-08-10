import type { CanActivate, ExecutionContext} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { ApiError } from "@salon/shared";

/**
 * Lightweight CSRF defense (SECURITY.md §4):
 *  - safe methods (GET/HEAD/OPTIONS) pass
 *  - state-changing requests must carry an allowed Origin (or Referer fallback)
 *  - enforced only when CORS_ORIGINS is configured (optional in dev/prod swap)
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowed = new Set(
    (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return true;
    }
    if (this.allowed.size === 0) {
      return true;
    }

    const origin = req.headers.origin as string | undefined;
    if (!origin) {
      const referer = req.headers.referer as string | undefined;
      if (!referer) {
        return true;
      }
      return this.check(new URL(referer).origin);
    }
    return this.check(origin);
  }

  private check(origin: string): boolean {
    if (this.allowed.has(origin)) {
      return true;
    }
    throw new ApiError({
      statusCode: 403,
      code: "CSRF_BLOCKED",
      message: "Cross-origin request blocked.",
    });
  }
}