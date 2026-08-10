import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import {
  ApiError,
  DEFAULT_TENANT_SETTINGS,
  type TenantProfileUpdateDto,
  type TenantSettings,
  type TenantSettingsUpdateDto,
} from "@salon/shared";
import { Tenant } from "../entities/tenant.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
import type { TenantContextData } from "./tenant-context";

export interface CreateTenantInput {
  slug: string;
  name: string;
  currency?: string;
  timezone?: string;
}

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async createTenant(
    input: CreateTenantInput,
    manager?: EntityManager,
  ): Promise<Tenant> {
    const repo = manager ? manager.getRepository(Tenant) : this.tenants;
    const slug = input.slug.trim().toLowerCase();
    const exists = await repo.findOne({ where: { slug } });
    if (exists) {
      throw new ApiError({
        statusCode: 409,
        code: "TENANT_SLUG_TAKEN",
        message: `Tenant slug "${slug}" is already in use.`,
      });
    }
    return repo.save(
      repo.create({
        slug,
        name: input.name.trim(),
        status: TenantStatus.ACTIVE,
        currency: input.currency ?? "LKR",
        timezone: input.timezone ?? "Asia/Colombo",
        settings: DEFAULT_TENANT_SETTINGS,
      }),
    );
  }

  async findById(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError({
        statusCode: 404,
        code: "TENANT_NOT_FOUND",
        message: "Tenant not found.",
      });
    }
    return tenant;
  }

  async setStatus(tenantId: string, status: TenantStatus): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    tenant.status = status;
    return this.tenants.save(tenant);
  }

  async getSettings(
    tenantId: string,
  ): Promise<TenantSettings & { currency: string; timezone: string }> {
    const tenant = await this.findById(tenantId);
    return { currency: tenant.currency, timezone: tenant.timezone, ...tenant.settings };
  }

  async updateSettings(
    tenantId: string,
    patch: TenantSettingsUpdateDto,
  ): Promise<TenantSettings> {
    const tenant = await this.findById(tenantId);
    tenant.settings = {
      ...tenant.settings,
      ...patch,
      cancellationPolicy: patch.cancellationPolicy
        ? { ...tenant.settings.cancellationPolicy, ...patch.cancellationPolicy }
        : tenant.settings.cancellationPolicy,
    };
    await this.tenants.save(tenant);
    return tenant.settings;
  }

  async updateProfile(tenantId: string, patch: TenantProfileUpdateDto): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    if (patch.name !== undefined) {
      tenant.name = patch.name.trim();
    }
    return this.tenants.save(tenant);
  }

  /** Scoping helper: derive the tenant id from an authenticated request context. */
  static tenantIdOf(ctx: TenantContextData | { tenantId: string }): string {
    return ctx.tenantId;
  }
}