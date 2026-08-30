import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, Repository } from "typeorm";
import {
  ApiError,
  UserRole,
  type CreateTeamMemberDto,
  type TenantLimits,
  type UpdateTeamMemberDto,
} from "@salon/shared";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { Staff } from "../entities/staff.entity";
import { UserStatus } from "../enums/user-status.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PasswordService } from "../auth/services/password.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SessionService } from "../auth/services/session.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import { resolveEmailTransport } from "../notification/providers/resolve-email-transport";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  staffId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserTenantRole) private readonly roles: Repository<UserTenantRole>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Everyone who can sign in to this salon.
   *
   * Driven from `user_tenant_role` rather than from `user`, because a user row
   * is global and a person may work at two salons. Only this salon's grants
   * may ever be listed here.
   */
  async list(tenantId: string): Promise<TeamMember[]> {
    const [grants, linked] = await Promise.all([
      this.roles.find({
        where: { tenantId },
        relations: { user: true },
        // UserTenantRole carries no timestamp of its own; the user's does.
        order: { user: { createdAt: "ASC" } },
      }),
      this.staffIdByUserId(tenantId),
    ]);

    return grants
      .filter((grant) => grant.user)
      .map((grant) => toMember(grant, linked.get(grant.userId) ?? null));
  }

  /**
   * `limits` is the tenant's resolved seat caps (`TenantLimits`, from
   * `TenantGuard`). Only MANAGER and RECEPTIONIST are capped here — STAFF
   * logins ride on the same seat as the stylist's own `Staff` profile, which
   * `StaffService.create` already caps separately.
   */
  async create(
    tenantId: string,
    dto: CreateTeamMemberDto,
    actorUserId: string,
    limits: Required<TenantLimits> | null,
  ): Promise<TeamMember> {
    const email = dto.email.trim().toLowerCase();

    return this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const roleRepo = manager.getRepository(UserTenantRole);

      const cap = seatCapFor(dto.role, limits);
      if (cap !== null) {
        const currentCount = await roleRepo.count({ where: { tenantId, role: dto.role } });
        if (currentCount >= cap) {
          throw new ApiError({
            statusCode: 409,
            code: "TEAM_SEAT_LIMIT_REACHED",
            message: `This salon's plan allows up to ${cap} ${roleLabel(dto.role)}${cap === 1 ? "" : "s"}. Ask your account manager to raise the limit.`,
          });
        }
      }

      // A user row is global: the same person may already work at another
      // salon. Reuse the account and add a grant rather than refusing, but
      // never reveal anything about the other salon.
      let user = await userRepo.findOne({ where: { email } });

      if (user) {
        const existingHere = await roleRepo.findOne({ where: { userId: user.id, tenantId } });
        if (existingHere) {
          throw new ApiError({
            statusCode: 409,
            code: "TEAM_MEMBER_EXISTS",
            message: "Someone with this email can already sign in to this salon.",
          });
        }
      } else {
        user = await userRepo.save(
          userRepo.create({
            email,
            name: dto.name.trim(),
            passwordHash: await this.passwords.hash(dto.password),
            status: UserStatus.ACTIVE,
          }),
        );
      }

      const grant = await roleRepo.save(
        roleRepo.create({
          userId: user.id,
          tenantId,
          role: dto.role as UserRole,
          branchId: null,
        }),
      );

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "TEAM_MEMBER_CREATED",
          entityType: "User",
          entityId: user.id,
          // Never the password, and never the hash.
          metadata: { email, role: dto.role },
        },
        manager,
      );

      // Brand new — nothing could have linked to this login yet.
      return toMember({ ...grant, user }, null);
    });
  }

  /**
   * Change someone's role, or suspend their access.
   *
   * Suspension rather than deletion: the audit trail references this user, and
   * a removed row would orphan the record of what they did.
   */
  async update(
    tenantId: string,
    userId: string,
    dto: UpdateTeamMemberDto,
    actorUserId: string,
  ): Promise<TeamMember> {
    const grant = await this.roles.findOne({
      where: { tenantId, userId },
      relations: { user: true },
    });
    if (!grant?.user) {
      throw new ApiError({
        statusCode: 404,
        code: "TEAM_MEMBER_NOT_FOUND",
        message: "That person does not have access to this salon.",
      });
    }
    if (grant.role === UserRole.OWNER) {
      throw new ApiError({
        statusCode: 409,
        code: "CANNOT_MODIFY_OWNER",
        message: "The salon owner's access cannot be changed from here.",
      });
    }
    if (userId === actorUserId) {
      // Nothing stops an owner locking themselves out otherwise, and there is
      // no self-service way back in.
      throw new ApiError({
        statusCode: 409,
        code: "CANNOT_MODIFY_SELF",
        message: "You cannot change your own access.",
      });
    }

    if (dto.status === "ACTIVE" && grant.user.status === UserStatus.LOCKED) {
      // Only a password reset may clear a lockout (account-lockout-v2,
      // DECISIONS.md) — flipping status back to ACTIVE here would restore
      // access without forcing a new password, without revoking whatever
      // sessions were live when it locked, and without resetting the
      // failure counter, quietly bypassing every hardening the reset
      // endpoint provides.
      throw new ApiError({
        statusCode: 409,
        code: "ACCOUNT_LOCKED",
        message: "This account is locked. Reset their password to restore access — a plain status change can't clear a lockout.",
      });
    }

    if (dto.role) {
      grant.role = dto.role as UserRole;
      await this.roles.save(grant);
    }
    if (dto.status) {
      grant.user.status =
        dto.status === "ACTIVE" ? UserStatus.ACTIVE : UserStatus.DISABLED;
      await this.users.save(grant.user);
    }

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TEAM_MEMBER_UPDATED",
      entityType: "User",
      entityId: userId,
      metadata: { role: dto.role, status: dto.status },
    });

    const linkedStaff = await this.staff.findOne({ where: { tenantId, userId } });
    return toMember(grant, linkedStaff?.id ?? null);
  }

  /**
   * Generates a new temporary password (also clears any lock) — the one
   * capability MANAGER gets that isn't full `MANAGE_TEAM` (account-lockout-
   * v2, DECISIONS.md). Same OWNER/self guardrails as `update()`: an OWNER's
   * own password can only be reset by SUPER_ADMIN (see
   * `SuperAdminService.resetTeamMemberPassword`), and nobody resets their
   * own from here — if you're locked out, you can't be the one clicking
   * this button anyway.
   */
  async resetPassword(
    tenantId: string,
    userId: string,
    actorUserId: string,
  ): Promise<{ userId: string; temporaryPassword: string }> {
    const grant = await this.roles.findOne({
      where: { tenantId, userId },
      relations: { user: true },
    });
    if (!grant?.user) {
      throw new ApiError({
        statusCode: 404,
        code: "TEAM_MEMBER_NOT_FOUND",
        message: "That person does not have access to this salon.",
      });
    }
    if (grant.role === UserRole.OWNER) {
      throw new ApiError({
        statusCode: 409,
        code: "CANNOT_MODIFY_OWNER",
        message: "The salon owner's access cannot be changed from here.",
      });
    }
    if (userId === actorUserId) {
      throw new ApiError({
        statusCode: 409,
        code: "CANNOT_MODIFY_SELF",
        message: "You cannot reset your own password from here.",
      });
    }

    const actorGrant = await this.roles.findOne({ where: { tenantId, userId: actorUserId } });
    return this.performPasswordReset(tenantId, grant.user, actorUserId, actorGrant?.role ?? null);
  }

  /**
   * Shared by the tenant-scoped reset above and
   * `SuperAdminService.resetTeamMemberPassword` — the one place that
   * actually generates, hashes, and reveals a new temporary password, so
   * both callers stay identical in every consequence: forces a
   * first-login change, clears any lock, revokes existing sessions, and
   * notifies (never a lighter-weight variant for either caller).
   */
  async performPasswordReset(
    tenantId: string,
    target: User,
    actorUserId: string,
    actorRole: UserRole | null,
  ): Promise<{ userId: string; temporaryPassword: string }> {
    const temporaryPassword = this.passwords.generate();
    await this.users.update(
      { id: target.id },
      {
        passwordHash: await this.passwords.hash(temporaryPassword),
        mustChangePassword: true,
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
      },
    );
    await this.sessions.revokeAllForUser(target.id);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TEAM_MEMBER_PASSWORD_RESET",
      entityType: "User",
      entityId: target.id,
      metadata: { resetByRole: actorRole },
    });

    await this.notifyPasswordReset(tenantId, target, actorRole);

    return { userId: target.id, temporaryPassword };
  }

  /**
   * Best-effort — mirrors `PlatformAlertService`'s own philosophy exactly:
   * an email that fails to send must never turn a successful reset into an
   * error, since the reset itself (and its audit trail) already happened.
   * Tells the affected person directly, and separately tells the OWNER
   * when a MANAGER (not the owner) performed the reset, so a careless or
   * compromised manager login can never silently take over a colleague's
   * account (account-lockout-v2 hardening #4, DECISIONS.md).
   */
  private async notifyPasswordReset(tenantId: string, target: User, actorRole: UserRole | null): Promise<void> {
    const transport = resolveEmailTransport();
    if (!transport) {
      this.logger.warn(`No email transport configured — password-reset notification not sent for ${target.email}`);
      return;
    }

    const byline = actorRole ? ` by a ${actorRole.toLowerCase()}` : "";
    try {
      await transport.send({
        to: target.email,
        subject: "Your password was reset",
        text: `Your password for the salon admin app was just reset${byline}. If you didn't expect this, contact your salon owner immediately.`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password-reset notification to ${target.email}`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    if (actorRole !== UserRole.MANAGER) {
      return;
    }
    const ownerGrant = await this.roles.findOne({
      where: { tenantId, role: UserRole.OWNER },
      relations: { user: true },
    });
    if (!ownerGrant?.user) {
      return;
    }
    try {
      await transport.send({
        to: ownerGrant.user.email,
        subject: `${target.name}'s password was reset`,
        text: `A manager reset ${target.name}'s (${target.email}) password just now. No action needed unless this wasn't expected.`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to notify the owner of a password reset for ${target.email}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /** One query for every login's linked staff row, keyed by userId. */
  private async staffIdByUserId(tenantId: string): Promise<Map<string, string>> {
    const rows = await this.staff.find({ where: { tenantId } });
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.userId) {
        map.set(row.userId, row.id);
      }
    }
    return map;
  }
}

/** `null` = uncapped, either because the role isn't seat-limited or the plan sets no ceiling. */
function seatCapFor(role: string, limits: Required<TenantLimits> | null): number | null {
  if (!limits) {
    return null;
  }
  if (role === UserRole.MANAGER) {
    return limits.maxManagers;
  }
  if (role === UserRole.RECEPTIONIST) {
    return limits.maxReceptionists;
  }
  return null;
}

function roleLabel(role: string): string {
  return role === UserRole.MANAGER ? "manager" : "receptionist";
}

function toMember(grant: UserTenantRole & { user: User }, staffId: string | null): TeamMember {
  return {
    userId: grant.user.id,
    name: grant.user.name,
    email: grant.user.email,
    role: grant.role,
    status: grant.user.status,
    staffId,
    lastLoginAt: grant.user.lastLoginAt,
    createdAt: grant.user.createdAt,
  };
}
