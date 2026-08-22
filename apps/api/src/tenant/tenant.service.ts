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
  DEFAULT_TENANT_ENTITLEMENTS,
  DEFAULT_TENANT_SETTINGS,
  resolveLimits,
  type PlanTier,
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
  /** Defaults to PRO — provisioning always sends an explicit choice; other callers get full access. */
  tier?: PlanTier;
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
        entitlements: { ...DEFAULT_TENANT_ENTITLEMENTS, tier: input.tier ?? DEFAULT_TENANT_ENTITLEMENTS.tier },
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

  /** Public salon lookup (no auth) — never leaks suspended/unknown tenants beyond a plain 404. */
  async findActiveBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({
      where: { slug, status: TenantStatus.ACTIVE },
    });
    if (!tenant) {
      throw new ApiError({
        statusCode: 404,
        code: "SALON_NOT_FOUND",
        message: "Salon not found.",
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

  /**
   * A tenant's own settings, capped by whatever the plan allows
   * (`TenantLimits.maxBookingWindowDays` / `maxReminderOffsets` /
   * `maxDiscountCapPercent`). Refused outright rather than silently clamped —
   * a salon that asked for a 90-day booking window and quietly got 14 would
   * never know their own setting didn't take.
   */
  async updateSettings(
    tenantId: string,
    patch: TenantSettingsUpdateDto,
  ): Promise<TenantSettings> {
    const tenant = await this.findById(tenantId);
    const limits = resolveLimits(tenant.entitlements);

    if (
      patch.bookingWindowDays !== undefined &&
      limits.maxBookingWindowDays !== null &&
      patch.bookingWindowDays > limits.maxBookingWindowDays
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "SETTING_EXCEEDS_PLAN_LIMIT",
        message: `This salon's plan allows a booking window of at most ${limits.maxBookingWindowDays} days.`,
      });
    }
    if (
      patch.reminderOffsets !== undefined &&
      limits.maxReminderOffsets !== null &&
      patch.reminderOffsets.length > limits.maxReminderOffsets
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "SETTING_EXCEEDS_PLAN_LIMIT",
        message: `This salon's plan allows at most ${limits.maxReminderOffsets} reminder${limits.maxReminderOffsets === 1 ? "" : "s"}.`,
      });
    }
    if (
      patch.discountCapPercent !== undefined &&
      limits.maxDiscountCapPercent !== null &&
      patch.discountCapPercent > limits.maxDiscountCapPercent
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "SETTING_EXCEEDS_PLAN_LIMIT",
        message: `This salon's plan allows a desk discount cap of at most ${limits.maxDiscountCapPercent}%.`,
      });
    }

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