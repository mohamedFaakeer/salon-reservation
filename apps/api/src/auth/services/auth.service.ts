import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import type { Repository } from "typeorm";
import type { CompleteFirstLoginDto, LoginDto } from "@salon/shared";
import { ApiError } from "@salon/shared";
import { User } from "../../entities/user.entity";
import { UserStatus } from "../../enums/user-status.enum";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";
import { parseDurationMs } from "./duration";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../../audit/audit.service";

/**
 * Account-level lockout threshold (DECISIONS.md's account-lockout-v2 entry).
 * Deliberately below `RateLimitGuard`'s per-minute limits (10/IP, 5/email
 * per minute) — this exists specifically to catch the slow, patient
 * attacker that per-minute rate limiting never trips: one guess every ten
 * seconds is comfortably under 5/minute, but is still 5 wrong passwords
 * against this per-account counter, which never resets on its own.
 *
 * A real account's lock is a persisted `User.status`/`failedLoginAttempts`
 * pair, not a sliding window — once it fires, only an explicit
 * OWNER/MANAGER/SUPER_ADMIN password reset clears it (never a timer).
 */
const LOGIN_LOCKOUT_THRESHOLD = 5;
/**
 * An email with no matching account has no row to persist a counter on, so
 * it falls back to the *old* audit-log-derived sliding window
 * (`AuditService.lockoutExpiry`) purely for enumeration-resistance
 * (DECISIONS.md hardening #1): without this, a real account would start
 * answering `ACCOUNT_LOCKED` after 5 attempts while a fake one never would,
 * letting a patient attacker tell real emails apart from made-up ones. A
 * fake identity has nothing real to protect, so auto-expiry is the right
 * (and only sensible) behavior here — the response is identically shaped
 * either way.
 */
const UNKNOWN_EMAIL_LOCKOUT_WINDOW_MS = 15 * 60_000;

const ACCOUNT_LOCKED_MESSAGE =
  "Too many incorrect attempts. Your account is locked. Ask your manager, salon owner, or platform admin to unlock it.";

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

/** Returned instead of `AuthResult` when the account must set a new password before it gets a real session. */
export interface FirstLoginChallenge {
  requiresPasswordChange: true;
  changeToken: string;
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

  /** A password-change token is only ever valid against the exact password it was issued for. */
  private fingerprint(passwordHash: string): string {
    return createHash("sha256").update(passwordHash).digest("hex");
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResult | FirstLoginChallenge> {
    const email = dto.email.toLowerCase();
    const user = await this.users.findOne({ where: { email } });

    if (user) {
      if (user.status === UserStatus.LOCKED) {
        throw new ApiError({ statusCode: 403, code: "ACCOUNT_LOCKED", message: ACCOUNT_LOCKED_MESSAGE });
      }
    } else {
      // No real row to persist a counter on — see UNKNOWN_EMAIL_LOCKOUT_WINDOW_MS.
      const lockedUntil = await this.audit.lockoutExpiry(
        email,
        "LOGIN_FAILED",
        "LOGIN_SUCCEEDED",
        LOGIN_LOCKOUT_THRESHOLD,
        UNKNOWN_EMAIL_LOCKOUT_WINDOW_MS,
      );
      if (lockedUntil) {
        throw new ApiError({ statusCode: 403, code: "ACCOUNT_LOCKED", message: ACCOUNT_LOCKED_MESSAGE });
      }
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

      if (user) {
        const failedLoginAttempts = user.failedLoginAttempts + 1;
        if (failedLoginAttempts >= LOGIN_LOCKOUT_THRESHOLD) {
          await this.users.update(
            { id: user.id },
            { failedLoginAttempts, status: UserStatus.LOCKED },
          );
          // Hardening #2: five wrong passwords is itself a signal the
          // account may be under attack — kill any session already open
          // elsewhere rather than waiting for a reset to do it.
          await this.sessions.revokeAllForUser(user.id);
          // Resolved here (unlike LOGIN_FAILED, hot-path-sensitive on every
          // attempt) because this fires once per lockout, and the platform
          // monitoring feature needs to know which salon's team to act on.
          const tenantId = await this.sessions.primaryTenantId(user.id);
          await this.audit.record({
            tenantId,
            actorUserId: user.id,
            action: "ACCOUNT_LOCKED",
            entityType: "User",
            entityId: user.id,
            metadata: { failedLoginAttempts },
            ipAddress: ip ?? null,
            userAgent: userAgent ?? null,
          });
        } else {
          await this.users.update({ id: user.id }, { failedLoginAttempts });
        }
      }

      throw new ApiError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ApiError({
        statusCode: 403,
        code: "ACCOUNT_DISABLED",
        message: "This account has been disabled.",
      });
    }

    if (user.mustChangePassword) {
      // Zero functional access until the change actually happens — not a
      // dismissible post-login reminder (DECISIONS.md, mirrors AWS
      // Cognito's/Okta's NEW_PASSWORD_REQUIRED challenge).
      return {
        requiresPasswordChange: true,
        changeToken: await this.tokens.signPasswordChangeToken(user.id, this.fingerprint(user.passwordHash)),
      };
    }

    return this.issueSession(user, ip, userAgent);
  }

  /**
   * Redeems the first-login "set a new password" challenge — accepts the
   * change-token from `login()` plus the chosen new password, and only then
   * issues a real session (same shape `login()` returns on success).
   */
  async completeFirstLogin(
    dto: CompleteFirstLoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    let claim: { userId: string; passwordHashFingerprint: string };
    try {
      claim = await this.tokens.verifyPasswordChangeToken(dto.changeToken);
    } catch {
      throw new ApiError({
        statusCode: 401,
        code: "TOKEN_INVALID",
        message: "This link has expired. Please sign in again.",
      });
    }

    const user = await this.users.findOne({ where: { id: claim.userId } });
    if (
      !user ||
      !user.mustChangePassword ||
      this.fingerprint(user.passwordHash) !== claim.passwordHashFingerprint
    ) {
      // Covers: account gone, already changed via another path since this
      // token was issued (fingerprint mismatch — DECISIONS.md hardening
      // #3), or already redeemed once (mustChangePassword already false).
      throw new ApiError({
        statusCode: 401,
        code: "TOKEN_INVALID",
        message: "This link has expired. Please sign in again.",
      });
    }

    await this.users.update(
      { id: user.id },
      { passwordHash: await this.password.hash(dto.newPassword), mustChangePassword: false },
    );
    user.mustChangePassword = false;

    return this.issueSession(user, ip, userAgent);
  }

  private async issueSession(user: User, ip?: string, userAgent?: string): Promise<AuthResult> {
    const sessionUser = await this.sessions.buildSessionUser(user.id);
    await this.users.update({ id: user.id }, { lastLoginAt: new Date(), failedLoginAttempts: 0 });
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
      absoluteSessionMaxMs: absoluteSessionMaxMs(),
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
  return parseDurationMs(process.env.JWT_REFRESH_TTL, "7d");
}

/**
 * Session-timeout policy (DECISIONS.md): even a continuously-active,
 * legitimately rotating refresh token is cut off this long after its
 * original login — one shift by default — so a stolen refresh-token cookie
 * can't stay useful indefinitely just by being replayed/rotated. Idle
 * timeout (enforced client-side, since the server can't see mouse activity)
 * is a separate, shorter limit layered on top of this one.
 */
function absoluteSessionMaxMs(): number {
  return parseDurationMs(process.env.JWT_ABSOLUTE_SESSION_MAX, "12h");
}