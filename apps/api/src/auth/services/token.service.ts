import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "./session.service";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string | null;
  branchId: string | null;
  roles: string[];
}

/**
 * Access-token minting/verification (HS256, SECURITY.md §2).
 *  - short-lived by default (JWT_ACCESS_TTL=15m)
 *  - claims are read-only mirrors of refresh_session rows; session state lives
 *    in the DB, so a revoked user loses access at the next refresh
 */
@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly issuer = "salon-reservation";
  private readonly audience = "salon-reservation";

  private static encodeSecret(value: string): Uint8Array {
    return new TextEncoder().encode(value);
  }

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const raw = this.config.get<string>("JWT_SECRET");
    if (!raw) {
      throw new Error(
        "JWT_SECRET is required. Copy .env.example to .env and set it.",
      );
    }
    if (raw.length < 32) {
      // SECURITY.md §13 pre-demo checklist: JWT secret must be >= 32 random
      // bytes. A short/guessable secret makes HS256 signatures forgeable.
      throw new Error(
        "JWT_SECRET must be at least 32 characters (SECURITY.md §13).",
      );
    }
    this.secret = TokenService.encodeSecret(raw);
  }

  async sign(sessionUser: SessionUser, ttl?: string): Promise<string> {
    const resolvedTtl = ttl ?? this.config.get<string>("JWT_ACCESS_TTL", "15m");
    return new SignJWT({
      email: sessionUser.email,
      name: sessionUser.name,
      tenantId: sessionUser.tenantId,
      branchId: sessionUser.branchId,
      roles: sessionUser.roles,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(sessionUser.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(resolvedTtl)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
    });
    if (payload.purpose) {
      // A special-purpose token (currently: the forced-first-login
      // password-change token) must never double as a real access token —
      // reject outright here, at the one choke point every route's
      // JwtAuthGuard calls, rather than relying on it merely decoding to
      // empty roles/tenantId (DECISIONS.md — defense in depth).
      throw new Error("Not an access token.");
    }
    return {
      sub: payload.sub ?? "",
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      tenantId:
        typeof payload.tenantId === "string" ? payload.tenantId : null,
      branchId:
        typeof payload.branchId === "string" ? payload.branchId : null,
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter((r): r is string => typeof r === "string")
        : [],
    };
  }

  /**
   * The forced-first-login "set a new password" challenge (DECISIONS.md) —
   * issued instead of a real session when `User.mustChangePassword` is
   * true. Deliberately a different shape from `AccessTokenPayload` (no
   * roles/tenantId at all) and short-lived (10 minutes): it grants no
   * access to anything except the one endpoint that redeems it.
   * `passwordHashFingerprint` binds the token to the exact password it was
   * issued against, so a token can't be replayed after the password
   * already changed through some other path in the meantime.
   */
  async signPasswordChangeToken(userId: string, passwordHashFingerprint: string): Promise<string> {
    return new SignJWT({ purpose: "password_change", fp: passwordHashFingerprint })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(this.secret);
  }

  async verifyPasswordChangeToken(token: string): Promise<{ userId: string; passwordHashFingerprint: string }> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
    });
    if (payload.purpose !== "password_change" || typeof payload.fp !== "string" || !payload.sub) {
      throw new Error("Not a password-change token.");
    }
    return { userId: payload.sub, passwordHashFingerprint: payload.fp };
  }
}