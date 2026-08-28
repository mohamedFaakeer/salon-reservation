import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, jwtVerify } from "jose";

export interface CustomerAccessTokenPayload {
  sub: string;
  phone: string;
  phoneVerified: boolean;
}

export interface CustomerTokenClaims {
  customerAccountId: string;
  phone: string;
  phoneVerified: boolean;
}

/**
 * The customer-account equivalent of `auth/services/token.service.ts` — same
 * HS256/short-lived-access design (SECURITY.md §2), reusing `JWT_SECRET` and
 * the same `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` env vars (no reason yet for
 * these to be tuned independently of the staff tokens). A distinct audience
 * (`salon-web-customer` vs. staff's `salon-reservation`) means a customer
 * token is cryptographically rejected by any guard expecting a staff one,
 * and vice versa — not just a convention, an enforced boundary.
 */
@Injectable()
export class CustomerTokenService {
  private readonly secret: Uint8Array;
  private readonly issuer = "salon-reservation";
  private readonly audience = "salon-web-customer";

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const raw = this.config.get<string>("JWT_SECRET");
    if (!raw) {
      throw new Error("JWT_SECRET is required. Copy .env.example to .env and set it.");
    }
    if (raw.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters (SECURITY.md §13).");
    }
    this.secret = new TextEncoder().encode(raw);
  }

  async sign(claims: CustomerTokenClaims, ttl?: string): Promise<string> {
    const resolvedTtl = ttl ?? this.config.get<string>("JWT_ACCESS_TTL", "15m");
    return new SignJWT({ phone: claims.phone, phoneVerified: claims.phoneVerified })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.customerAccountId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(resolvedTtl)
      .sign(this.secret);
  }

  async verify(token: string): Promise<CustomerAccessTokenPayload> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
    });
    return {
      sub: payload.sub ?? "",
      phone: typeof payload.phone === "string" ? payload.phone : "",
      phoneVerified: payload.phoneVerified === true,
    };
  }
}
