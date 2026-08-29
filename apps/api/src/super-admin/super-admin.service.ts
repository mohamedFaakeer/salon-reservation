import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, Repository } from "typeorm";
import {
  ApiError,
  AppointmentStatus,
  UserRole,
  resolveLimits,
  resolveModules,
  resolveReportPanels,
  type PaginationQueryDto,
  type TenantEntitlements,
  type UpdateTenantEntitlementsDto,
  type UpdateTenantVisibilityDto,
  type ProvisionTenantDto,
} from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { Branch } from "../entities/branch.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { UserStatus } from "../enums/user-status.enum";
import { PasswordService } from "../auth/services/password.service";
import { TenantService } from "../tenant/tenant.service";
import { AuditService } from "../audit/audit.service";
import { colomboNow } from "../availability/time.util";

/** Mirrors `DOES_NOT_COUNT_TOWARD_DAILY_LIMIT` in booking.service.ts — what an active booking day actually counts. */
const NOT_A_LIVE_BOOKING: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
  AppointmentStatus.PENDING_PAYMENT,
];

export interface TenantEntitlementsView {
  tier: TenantEntitlements["tier"];
  moduleOverrides: TenantEntitlements["moduleOverrides"];
  reportPanelOverrides: TenantEntitlements["reportPanelOverrides"];
  limitOverrides: TenantEntitlements["limitOverrides"];
  modules: ReturnType<typeof resolveModules>;
  reportPanels: ReturnType<typeof resolveReportPanels>;
  limits: ReturnType<typeof resolveLimits>;
}

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Provisions a tenant + default branch + OWNER user in one transaction, so
   * a taken owner email can never leave an orphan ACTIVE tenant behind. The
   * TENANT_PROVISIONED audit entry is written with the same transaction
   * manager, so it commits atomically with the rest (SECURITY.md §10).
   */
  async provisionTenant(
    dto: ProvisionTenantDto,
    actorUserId: string,
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
        { slug: dto.slug, name: dto.salonName, tier: dto.tier },
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

      await this.audit.record(
        {
          tenantId: tenant.id,
          actorUserId,
          action: "TENANT_PROVISIONED",
          entityType: "Tenant",
          entityId: tenant.id,
          metadata: { slug: tenant.slug, ownerEmail: owner.email },
        },
        manager,
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

  /**
   * `bookingsToday` / `overBookingLimit` are computed live against today's
   * real appointments, not a stored flag — nothing to reset at midnight, and
   * it can never drift from what actually happened. "Over" means past the
   * plan's own `maxBookingsPerDay`, before the `BOOKING_LIMIT_GRACE` buffer
   * that only actually blocks a new booking — the flag is a heads-up, not a
   * restatement of the block.
   */
  async listTenants(
    query: PaginationQueryDto,
  ): Promise<{
    data: Array<
      Pick<
        Tenant,
        | "id"
        | "slug"
        | "name"
        | "status"
        | "customerBookingEnabled"
        | "currency"
        | "timezone"
        | "createdAt"
        | "deletionRequestedAt"
        | "purgedAt"
        | "deactivationReason"
      > & {
        tier: TenantEntitlements["tier"];
        bookingsToday: number;
        overBookingLimit: boolean;
      }
    >;
    meta: { total: number; limit: number; offset: number };
  }> {
    const [data, total] = await this.tenants.findAndCount({
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });

    const today = colomboNow(new Date()).date;
    const counts = data.length
      ? await this.appointments
          .createQueryBuilder("a")
          .select('a."tenantId"', "tenantId")
          .addSelect("COUNT(*)", "count")
          .where('a."tenantId" IN (:...tenantIds)', { tenantIds: data.map((t) => t.id) })
          .andWhere('a."appointmentDate" = :today', { today })
          .andWhere('a."status" NOT IN (:...excluded)', { excluded: NOT_A_LIVE_BOOKING })
          .groupBy('a."tenantId"')
          .getRawMany<{ tenantId: string; count: string }>()
      : [];
    const countByTenant = new Map(counts.map((c) => [c.tenantId, Number(c.count)]));

    return {
      data: data.map((t) => {
        const limits = resolveLimits(t.entitlements);
        const bookingsToday = countByTenant.get(t.id) ?? 0;
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          status: t.status,
          customerBookingEnabled: t.customerBookingEnabled,
          currency: t.currency,
          timezone: t.timezone,
          createdAt: t.createdAt,
          deletionRequestedAt: t.deletionRequestedAt,
          purgedAt: t.purgedAt,
          deactivationReason: t.deactivationReason,
          tier: t.entitlements.tier,
          bookingsToday,
          overBookingLimit: limits.maxBookingsPerDay !== null && bookingsToday > limits.maxBookingsPerDay,
        };
      }),
      meta: { total, limit: query.limit, offset: query.offset },
    };
  }

  async getEntitlements(tenantId: string): Promise<TenantEntitlementsView> {
    const tenant = await this.findOwned(tenantId);
    return this.toEntitlementsView(tenant);
  }

  async updateEntitlements(
    tenantId: string,
    dto: UpdateTenantEntitlementsDto,
    actorUserId: string,
  ): Promise<TenantEntitlementsView> {
    const tenant = await this.findOwned(tenantId);
    tenant.entitlements = {
      tier: dto.tier,
      moduleOverrides: dto.moduleOverrides ?? {},
      reportPanelOverrides: dto.reportPanelOverrides ?? {},
      limitOverrides: dto.limitOverrides ?? {},
    };
    await this.tenants.save(tenant);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TENANT_ENTITLEMENTS_UPDATED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { tier: dto.tier, moduleOverrides: dto.moduleOverrides, limitOverrides: dto.limitOverrides },
    });

    return this.toEntitlementsView(tenant);
  }

  /**
   * The activate/deactivate switch (DECISIONS.md) — deliberately separate
   * from `updateEntitlements`/`status`: this only controls whether customers
   * can discover/book the salon (`SalonService.list`, `TenantService.findActiveBySlug`),
   * never staff/admin login, which `TenantGuard` gates from `status` alone.
   */
  async setCustomerVisibility(
    tenantId: string,
    dto: UpdateTenantVisibilityDto,
    actorUserId: string,
  ): Promise<Pick<Tenant, "id" | "customerBookingEnabled">> {
    const tenant = await this.findOwned(tenantId);
    tenant.customerBookingEnabled = dto.customerBookingEnabled;
    await this.tenants.save(tenant);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TENANT_CUSTOMER_VISIBILITY_UPDATED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { customerBookingEnabled: dto.customerBookingEnabled },
    });

    return { id: tenant.id, customerBookingEnabled: tenant.customerBookingEnabled };
  }

  private async findOwned(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError({ statusCode: 404, code: "TENANT_NOT_FOUND", message: "Tenant not found." });
    }
    return tenant;
  }

  private toEntitlementsView(tenant: Tenant): TenantEntitlementsView {
    return {
      tier: tenant.entitlements.tier,
      moduleOverrides: tenant.entitlements.moduleOverrides,
      reportPanelOverrides: tenant.entitlements.reportPanelOverrides,
      limitOverrides: tenant.entitlements.limitOverrides,
      modules: resolveModules(tenant.entitlements),
      reportPanels: resolveReportPanels(tenant.entitlements),
      limits: resolveLimits(tenant.entitlements),
    };
  }
}
