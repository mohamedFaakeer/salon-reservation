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
}