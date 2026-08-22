import { Injectable } from "@nestjs/common";
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
import { AuditService } from "../audit/audit.service";

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
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserTenantRole) private readonly roles: Repository<UserTenantRole>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    private readonly passwords: PasswordService,
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
