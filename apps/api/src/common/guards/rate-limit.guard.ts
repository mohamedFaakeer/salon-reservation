import type { CanActivate, ExecutionContext} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "@salon/shared";

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

/**
 * Zero-dependency in-memory sliding-window rate limiter (SECURITY.md §4).
 * Suitable for a single-instance MVP; swap for Redis/ThrottlerGuard
 * when scaling horizontally.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, number[]>();
  private readonly options: RateLimitOptions;

  constructor(options?: Partial<RateLimitOptions>) {
    this.options = {
      max: Number(process.env.RATE_LIMIT_MAX ?? 100),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      ...options,
    };
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse();
    const key = req.headers["x-forwarded-for"]
      ? String(req.headers["x-forwarded-for"])
      : req.ip ?? req.socket.remoteAddress ?? "unknown";

    const now = Date.now();
    const cutoff = now - this.options.windowMs;
    const stamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);

    if (stamps.length >= this.options.max) {
      res.setHeader("Retry-After", String(Math.ceil(this.options.windowMs / 1000)));
      throw new ApiError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
      });
    }

    stamps.push(now);
    this.windows.set(key, stamps);
    return true;
  }
}