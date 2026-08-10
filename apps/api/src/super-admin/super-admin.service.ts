import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource, Repository } from "typeorm";
import { ApiError, UserRole, type PaginationQueryDto, type ProvisionTenantDto } from "@salon/shared";
import { Branch } from "../entities/branch.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { UserStatus } from "../enums/user-status.enum";
import { PasswordService } from "../auth/services/password.service";
import { TenantService } from "../tenant/tenant.service";

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
  ) {}

  /**
   * Provisions a tenant + default branch + OWNER user in one transaction, so
   * a taken owner email can never leave an orphan ACTIVE tenant behind.
   *
   * AUDIT-LOG GAP: no AuditLog entity exists yet anywhere in this codebase.
   * SECURITY.md §3 calls for super-admin ops to be audited — not built here;
   * tracked in DECISIONS.md, not silently dropped.
   */
  async provisionTenant(
    dto: ProvisionTenantDto,
  ): Promise<{
    tenant: Pick<Tenant, "id" | "slug" | "name" | "status" | "currency" | "timezone">;
    owner: { id: string; email: string; name: string };
  }> {
    return this.dataSource.transaction(async (manager) => {
      const email = dto.ownerEmail.trim().toLowerCase();
      const userRepo = manager.getRepository(User);
      const existingOwner = await userRepo.findOne({ where: { email } });
      if (existingOwner) {
        throw new ApiError({
          statusCode: 409,
          code: "OWNER_EMAIL_TAKEN",
          message: `Email "${email}" is already registered.`,
        });
      }

      const tenant = await this.tenantService.createTenant(
        { slug: dto.slug, name: dto.salonName },
        manager,
      );

      const branchRepo = manager.getRepository(Branch);
      const branch = await branchRepo.save(
        branchRepo.create({ tenantId: tenant.id, name: "Main Branch" }),
      );

      const passwordHash = await this.passwordService.hash(dto.ownerPassword);
      const owner = await userRepo.save(
        userRepo.create({
          email,
          passwordHash,
          name: dto.ownerName.trim(),
          status: UserStatus.ACTIVE,
        }),
      );

      const utrRepo = manager.getRepository(UserTenantRole);
      await utrRepo.save(
        utrRepo.create({
          userId: owner.id,
          tenantId: tenant.id,
          role: UserRole.OWNER,
          branchId: branch.id,
        }),
      );

      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          currency: tenant.currency,
          timezone: tenant.timezone,
        },
        owner: { id: owner.id, email: owner.email, name: owner.name },
      };
    });
  }

  async listTenants(
    query: PaginationQueryDto,
  ): Promise<{
    data: Array<Pick<Tenant, "id" | "slug" | "name" | "status" | "currency" | "timezone" | "createdAt">>;
    meta: { total: number; limit: number; offset: number };
  }> {
    const [data, total] = await this.tenants.findAndCount({
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return {
      data: data.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status,
        currency: t.currency,
        timezone: t.timezone,
        createdAt: t.createdAt,
      })),
      meta: { total, limit: query.limit, offset: query.offset },
    };
  }
}
