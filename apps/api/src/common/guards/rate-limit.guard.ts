import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "@salon/shared";

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

interface RateLimitRule {
  /** Appears in the 429 message, so the caller knows which limit they hit. */
  name: string;
  method: string;
  /** Matched against the path with the `/api/v1` prefix stripped. */
  pattern: RegExp;
  max: number;
  windowMs: number;
  /** When set, the named body field gets its own bucket alongside the per-IP one. */
  accountField?: string;
  accountMax?: number;
}

/**
 * Per-IP sliding-window rate limiting on the endpoints SECURITY.md §2 and §9
 * name: sign-in, booking creation, payment mutation, and public availability.
 *
 * This used to be one 100-requests-per-minute bucket applied to every route,
 * which is both more and less than the spec asked for. Less, because sign-in —
 * the endpoint that actually needs a tight limit — shared its allowance with
 * everything else. More, because a single salon behind one office NAT shares
 * one bucket, and a receptionist opening the availability board spends eleven
 * requests on one page load. `/health` was throttled too, so a platform health
 * check could be told 429 and cycle the instance.
 *
 * Ordinary authenticated reads are no longer throttled per-route; they sit
 * behind JWT, RBAC and tenant scoping, and are covered by the generous global
 * ceiling below as a denial-of-service backstop rather than a usage limit.
 */
const RULES: RateLimitRule[] = [
  {
    name: "sign-in",
    method: "POST",
    pattern: /^\/auth\/(login|refresh)$/,
    max: 10,
    windowMs: 60_000,
    // Per-account as well as per-IP, so one account cannot be brute-forced
    // from a rotating set of addresses (SECURITY.md §2).
    accountField: "email",
    accountMax: 5,
  },
  {
    name: "booking",
    method: "POST",
    pattern: /^\/salons\/[^/]+\/bookings$|^\/appointments$/,
    max: 20,
    windowMs: 60_000,
  },
  {
    name: "payment",
    method: "POST",
    pattern:
      /^\/payments\/[^/]+\/(confirm|cancel|refund)$|^\/appointments\/[^/]+\/payments$/,
    max: 20,
    windowMs: 60_000,
  },
  {
    name: "availability",
    method: "POST",
    pattern: /^\/salons\/[^/]+\/availability$/,
    max: 60,
    windowMs: 60_000,
  },
  {
    // Tighter than "payment": a gift-card code is a bearer credential with
    // no second factor (unlike a booking reference, always paired with a
    // phone number), so this is this codebase's first public endpoint where
    // guessing codes to find a live balance is the realistic threat
    // (SECURITY.md).
    name: "gift-card-lookup",
    method: "POST",
    pattern: /^\/payments\/[^/]+\/gift-card-preview$/,
    max: 10,
    windowMs: 60_000,
  },
  {
    // Same bearer-credential reasoning as "gift-card-lookup".
    name: "package-lookup",
    method: "POST",
    pattern: /^\/payments\/[^/]+\/package-preview$/,
    max: 10,
    windowMs: 60_000,
  },
  {
    // Guards against a repeated accidental mass-send, not everyday use — an
    // owner sending one campaign to a handful of lapsed customers a day
    // never comes close to this.
    name: "winback-campaign",
    method: "POST",
    pattern: /^\/reports\/lapsed-customers\/winback$/,
    max: 5,
    windowMs: 60_000,
  },
  {
    // Same shape as "payment" but a little higher — a busy retail counter
    // rings up more transactions per minute than an appointment desk does.
    name: "retail-checkout",
    method: "POST",
    pattern: /^\/retail-sales\/checkout$/,
    max: 30,
    windowMs: 60_000,
  },
];

/** Health checks must never be throttled — a 429 here reads as an outage. */
const NEVER_LIMITED = /^\/health$/;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, number[]>();
  private readonly options: RateLimitOptions;
  /** Only honour X-Forwarded-For behind a proxy we control (Render sets it). */
  private readonly trustProxy = process.env.TRUST_PROXY === "true";

  constructor(options?: Partial<RateLimitOptions>) {
    this.options = {
      max: Number(process.env.RATE_LIMIT_MAX ?? 600),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      ...options,
    };
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = this.routePath(req);
    if (NEVER_LIMITED.test(path)) {
      return true;
    }

    const res = ctx.switchToHttp().getResponse();
    const ip = this.clientIp(req);
    const rule = RULES.find((r) => r.method === req.method && r.pattern.test(path));

    if (rule) {
      this.consume(res, `${rule.name}:ip:${ip}`, rule.max, rule.windowMs, rule.name);
      const account = this.accountOf(req, rule);
      if (account !== null) {
        this.consume(
          res,
          `${rule.name}:account:${account}`,
          rule.accountMax ?? rule.max,
          rule.windowMs,
          rule.name,
        );
      }
    }

    // Global backstop: not a usage limit, a flood stop.
    this.consume(res, `global:${ip}`, this.options.max, this.options.windowMs, "request");
    return true;
  }

  /** The path with the global prefix removed, so rules read like the API docs. */
  private routePath(req: Request): string {
    const path = req.path.split("?")[0];
    return path.startsWith("/api/v1") ? path.slice("/api/v1".length) || "/" : path;
  }

  /**
   * The whole X-Forwarded-For header used to be the bucket key, which meant
   * appending anything to it minted a fresh bucket — a complete bypass — and
   * let a caller poison another address's bucket by naming it. Only the first
   * entry counts, and only when we are actually behind a trusted proxy.
   */
  private clientIp(req: Request): string {
    if (this.trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
  }

  private accountOf(req: Request, rule: RateLimitRule): string | null {
    if (!rule.accountField) {
      return null;
    }
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null) {
      return null;
    }
    const value = (body as Record<string, unknown>)[rule.accountField];
    return typeof value === "string" && value.length > 0 ? value.toLowerCase() : null;
  }

  private consume(
    res: { setHeader: (name: string, value: string) => void },
    key: string,
    max: number,
    windowMs: number,
    label: string,
  ): void {
    const now = Date.now();
    const cutoff = now - windowMs;
    const stamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);

    if (stamps.length >= max) {
      // Seconds until the oldest stamp falls out of the window, not the whole
      // window — telling a caller to wait 60s when a slot frees in 3 is wrong.
      const retryMs = stamps[0] + windowMs - now;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryMs / 1000))));
      this.windows.set(key, stamps);
      throw new ApiError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: `Too many ${label} attempts. Please try again shortly.`,
      });
    }

    stamps.push(now);
    this.windows.set(key, stamps);
    // Keys are unbounded otherwise: one entry per address, kept forever.
    if (this.windows.size > 10_000) {
      this.evictExpired(now);
    }
  }

  private evictExpired(now: number): void {
    for (const [key, stamps] of this.windows) {
      if (stamps.length === 0 || stamps[stamps.length - 1] <= now - this.options.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
