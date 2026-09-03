import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Repository } from "typeorm";
import { IsNull, LessThan, MoreThan } from "typeorm";
import { RefreshSession } from "../../entities/refresh-session.entity";
import { User } from "../../entities/user.entity";
import { UserTenantRole } from "../../entities/user-tenant-role.entity";
import { UserRole } from "@salon/shared";
import { ApiError } from "@salon/shared";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../../audit/audit.service";

export interface RefreshTokenPayload {
  refreshToken: string;
  sid: string;
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  tenantId: string | null;
  roles: UserRole[];
  branchId: string | null;
}

/**
 * Opaque refresh-token lifecycle (SECURITY.md §2):
 *  - raw token is 32 random bytes, returned once
 *  - only its SHA-256 hash is stored in refresh_session
 *  - rotation: using a token issues a new session and revokes the old one
 *  - reuse detection: presenting an already-rotated token revokes the whole family
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(RefreshSession)
    private readonly refreshRepo: Repository<RefreshSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserTenantRole)
    private readonly roleRepo: Repository<UserTenantRole>,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(input: {
    userId: string;
    ip?: string;
    userAgent?: string;
    ttlMs: number;
    /** Carried forward unchanged on rotation; a fresh login gets a new one. */
    familyId?: string;
    /** Carried forward unchanged on rotation; a fresh login starts the clock now. */
    familyStartedAt?: Date;
  }): Promise<RefreshTokenPayload> {
    const token = randomBytes(32).toString("base64url");
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: input.userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + input.ttlMs),
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        familyId: input.familyId ?? randomUUID(),
        familyStartedAt: input.familyStartedAt ?? new Date(),
      }),
    );
    return { refreshToken: token, sid: this.hashToken(token) };
  }

  async rotate(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
    ttlMs: number;
    /** Absolute-session-cap policy (DECISIONS.md, session-timeout policy) — measured from `familyStartedAt`, not per-token. */
    absoluteSessionMaxMs: number;
  }): Promise<{ sessionUser: SessionUser; sid: string; refreshToken: string }> {
    const tokenHash = this.hashToken(input.refreshToken);
    const session = await this.refreshRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
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
      // to kill a stolen session chain.
      await this.revokeAllForUser(session.userId);
      // High-signal security event — a real login token being replayed after
      // it was already rotated out, the classic sign of a stolen/leaked
      // session. Previously this was a silent revoke with no queryable
      // trace; the super-admin monitoring feature needs it recorded.
      await this.audit.record({
        tenantId: null,
        actorUserId: session.userId,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        entityType: "RefreshSession",
        entityId: session.id,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
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

    if (Date.now() - session.familyStartedAt.getTime() > input.absoluteSessionMaxMs) {
      // Bounds how long a login can stay alive at all, even with continuous
      // legitimate activity rotating it forever — the one limit idle-timeout
      // and per-token TTL can't provide on their own (DECISIONS.md,
      // session-timeout policy). Ends the whole family, matching the
      // reuse-detection precedent above: once the cap is hit, everything
      // descended from this login must re-authenticate, not just this token.
      await this.revokeFamily(session.familyId);
      await this.audit.record({
        tenantId: null,
        actorUserId: session.userId,
        action: "SESSION_ABSOLUTE_CAP_REACHED",
        entityType: "RefreshSession",
        entityId: session.id,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new ApiError({
        statusCode: 401,
        code: "SESSION_EXPIRED",
        message: "Your session has reached its maximum length. Please sign in again.",
      });
    }

    const next = await this.createSession({
      userId: session.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      ttlMs: input.ttlMs,
      familyId: session.familyId,
      familyStartedAt: session.familyStartedAt,
    });

    await this.refreshRepo.update(
      { id: session.id },
      {
        revokedAt: new Date(),
        replacedBySessionId: next.sid,
      },
    );

    return {
      sessionUser: await this.buildSessionUser(session.user.id),
      sid: next.sid,
      refreshToken: next.refreshToken,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshRepo.update({ tokenHash }, { revokedAt: new Date() });
  }

  /**
   * Kills every active session for one account — used by refresh-token-reuse
   * detection above, and by account lockout / password reset (DECISIONS.md):
   * a password change or a suspected brute-force attempt both mean any
   * already-open session should require re-authentication, not stay valid
   * on whatever it was issued against.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * Kills every still-live session descended from one login (the absolute
   * session cap, above) — narrower than `revokeAllForUser`: a different
   * device's unrelated family (e.g. the same owner also signed in on their
   * phone) is left untouched.
   */
  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshRepo.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * The one tenant a login is "for," same rule `buildSessionUser` already
   * uses (the first non-SUPER_ADMIN grant) — used by account lockout to
   * attach a tenantId to the (rare) `ACCOUNT_LOCKED` audit row, so the
   * platform monitoring feature knows which salon's team to act on. Unlike
   * `LOGIN_FAILED` (fired on every wrong attempt, hot-path sensitive),
   * lockout only fires once per lockout event, so this extra query is
   * negligible. Returns `null` for a platform-only SUPER_ADMIN with no
   * tenant grant.
   */
  async primaryTenantId(userId: string): Promise<string | null> {
    const tenantRoles = await this.roleRepo.find({ where: { userId } });
    return tenantRoles.find((r) => r.role !== UserRole.SUPER_ADMIN)?.tenantId ?? null;
  }

  /** Session was used for access control; returns the user + tenant context. */
  async buildSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHENTICATED",
        message: "Your account no longer exists.",
      });
    }
    if (user.status !== "ACTIVE") {
      throw new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "This account has been disabled.",
      });
    }

    const tenantRoles = await this.roleRepo.find({ where: { userId: user.id } });
    const tenantRole = tenantRoles.find((r) => r.role !== UserRole.SUPER_ADMIN);
    const tenantId = tenantRole?.tenantId ?? null;
    const branchId = tenantRole?.branchId ?? null;

    // A user may hold no tenant role (e.g. platform-only SUPER_ADMIN).
    // For tenant-scoped access the caller must attach a tenant explicitly.
    // SUPER_ADMIN can't live in user_tenant_role (NOT NULL tenantId), so it's
    // carried on the user row instead and merged in here.
    const roles = tenantRoles.map((r) => r.role);
    if (user.isSuperAdmin && !roles.includes(UserRole.SUPER_ADMIN)) {
      roles.push(UserRole.SUPER_ADMIN);
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId,
      roles,
      branchId,
    };
  }

  async cleanupExpired(): Promise<void> {
    await this.refreshRepo.delete({
      expiresAt: LessThan(new Date()),
      revokedAt: MoreThan(new Date(0)),
    });
  }
}