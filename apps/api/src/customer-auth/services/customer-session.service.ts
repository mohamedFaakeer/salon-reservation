import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "node:crypto";
import type { Repository } from "typeorm";
import { IsNull, LessThan, MoreThan } from "typeorm";
import { ApiError } from "@salon/shared";
import { CustomerRefreshSession } from "../../entities/customer-refresh-session.entity";
import type { CustomerAccount } from "../../entities/customer-account.entity";

export interface CustomerRefreshTokenPayload {
  refreshToken: string;
  sid: string;
}

/**
 * The customer-account equivalent of `auth/services/session.service.ts` —
 * identical opaque-refresh-token lifecycle (32 random bytes, only its
 * SHA-256 hash stored, rotate-on-use, reuse revokes the whole family). See
 * that file for the full rationale; duplicated here rather than
 * generalized because a customer session carries no tenant/role to resolve.
 */
@Injectable()
export class CustomerSessionService {
  constructor(
    @InjectRepository(CustomerRefreshSession)
    private readonly refreshRepo: Repository<CustomerRefreshSession>,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(input: {
    customerAccountId: string;
    ip?: string;
    userAgent?: string;
    ttlMs: number;
  }): Promise<CustomerRefreshTokenPayload> {
    const token = randomBytes(32).toString("base64url");
    await this.refreshRepo.save(
      this.refreshRepo.create({
        customerAccountId: input.customerAccountId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + input.ttlMs),
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      }),
    );
    return { refreshToken: token, sid: this.hashToken(token) };
  }

  async rotate(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
    ttlMs: number;
  }): Promise<{ account: CustomerAccount; sid: string; refreshToken: string }> {
    const tokenHash = this.hashToken(input.refreshToken);
    const session = await this.refreshRepo.findOne({
      where: { tokenHash },
      relations: { customerAccount: true },
    });

    if (!session) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Your session is no longer valid. Please sign in again.",
      });
    }

    if (session.revokedAt !== null) {
      // Reuse of an already-rotated/revoked token → revoke the entire family
      // to kill a stolen session chain (SECURITY.md §2).
      await this.refreshRepo.update(
        { customerAccountId: session.customerAccountId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Your session is no longer valid. Please sign in again.",
      });
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new ApiError({
        statusCode: 401,
        code: "TOKEN_EXPIRED",
        message: "Your session has expired. Please sign in again.",
      });
    }

    const next = await this.createSession({
      customerAccountId: session.customerAccountId,
      ip: input.ip,
      userAgent: input.userAgent,
      ttlMs: input.ttlMs,
    });

    await this.refreshRepo.update(
      { id: session.id },
      { revokedAt: new Date(), replacedBySessionId: next.sid },
    );

    return { account: session.customerAccount, sid: next.sid, refreshToken: next.refreshToken };
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshRepo.update({ tokenHash }, { revokedAt: new Date() });
  }

  async cleanupExpired(): Promise<void> {
    await this.refreshRepo.delete({
      expiresAt: LessThan(new Date()),
      revokedAt: MoreThan(new Date(0)),
    });
  }
}
