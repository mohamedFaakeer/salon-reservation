import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { LoginDto } from "@salon/shared";
import { ApiError } from "@salon/shared";
import { User } from "../../entities/user.entity";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../../audit/audit.service";

/**
 * Account-level lockout thresholds (DECISIONS.md's login-security entry).
 * Deliberately below `RateLimitGuard`'s per-minute limits (10/IP, 5/email
 * per minute) — this exists specifically to catch the slow, patient
 * attacker that per-minute rate limiting never trips: one guess every ten
 * seconds is comfortably under 5/minute, but is still 5 wrong passwords in
 * under a minute against this longer, per-account window.
 */
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60_000;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string | null;
    roles: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @Inject(PasswordService) private readonly password: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TokenService) private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.users.findOne({ where: { email } });

    // Checked before verifying the password, on the same entityId
    // convention LOGIN_FAILED already audits under (`user?.id ?? email`) —
    // an unknown email degrades gracefully to a pure sliding window, since
    // no LOGIN_SUCCEEDED can ever exist for a plain email string.
    const lockoutEntityId = user?.id ?? email;
    const lockedUntil = await this.audit.lockoutExpiry(
      lockoutEntityId,
      "LOGIN_FAILED",
      "LOGIN_SUCCEEDED",
      LOGIN_LOCKOUT_THRESHOLD,
      LOGIN_LOCKOUT_WINDOW_MS,
    );
    if (lockedUntil) {
      const minutesLeft = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
      throw new ApiError({
        statusCode: 429,
        code: "ACCOUNT_TEMPORARILY_LOCKED",
        message: `Too many incorrect attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
      });
    }

    if (
      !user ||
      !(await this.password.verify(user.passwordHash, dto.password))
    ) {
      // No tenantId here deliberately — resolving it costs an extra query on
      // a path that's already the target of brute-force attempts, and the
      // security-events view doesn't need per-tenant attribution to be
      // useful for spotting repeated attempts against one email/IP.
      await this.audit.record({
        tenantId: null,
        actorUserId: user?.id ?? null,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user?.id ?? email,
        metadata: user ? {} : { attemptedEmail: email },
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
      });
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      });
    }
    if (user.status !== "ACTIVE") {
      throw new ApiError({
        statusCode: 403,
        code: "ACCOUNT_DISABLED",
        message: "This account has been disabled.",
      });
    }

    const sessionUser = await this.sessions.buildSessionUser(user.id);
    await this.users.update({ id: user.id }, { lastLoginAt: new Date() });
    await this.audit.record({
      tenantId: sessionUser.tenantId,
      actorUserId: user.id,
      action: "LOGIN_SUCCEEDED",
      entityType: "User",
      entityId: user.id,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });
    const session = await this.sessions.createSession({
      userId: user.id,
      ip,
      userAgent,
      ttlMs: refreshTtlMs(),
    });

    return {
      accessToken: await this.tokens.sign(sessionUser),
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: sessionUser.tenantId,
        roles: sessionUser.roles,
      },
    };
  }

  async refresh(
    refreshToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const rotated = await this.sessions.rotate({
      refreshToken,
      ip,
      userAgent,
      ttlMs: refreshTtlMs(),
    });
    return {
      accessToken: await this.tokens.sign(rotated.sessionUser),
      refreshToken: rotated.refreshToken,
      user: {
        id: rotated.sessionUser.userId,
        email: rotated.sessionUser.email,
        name: rotated.sessionUser.name,
        tenantId: rotated.sessionUser.tenantId,
        roles: rotated.sessionUser.roles,
      },
    };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.sessions.revoke(refreshToken);
    }
  }
}

function refreshTtlMs(): number {
  const ttl = process.env.JWT_REFRESH_TTL ?? "7d";
  const m = /^(\d+)([smhd])$/.exec(ttl);
  const mult: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const n = m ? Number(m[1]) : 7;
  const u = m ? m[2] : "d";
  return n * mult[u];
}