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
// CloudinaryService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { detectImage } from "../common/image.util";

const LOGO_MAX_BYTES = 1_000_000;
const LOGO_MIN_DIMENSION = 200;
const LOGO_MAX_DIMENSION = 4000;
const LOGO_MAX_ASPECT_RATIO = 2;

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
    private readonly cloudinary: CloudinaryService,
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

  /**
   * Public salon lookup (no auth) — never leaks suspended/unknown tenants
   * beyond a plain 404. Shared by both the profile page and booking creation
   * (BookingController), so this one check protects both — the server never
   * trusts that a customer only reached booking creation via the profile
   * page's own "not accepting bookings" state.
   *
   * `customerBookingEnabled` is checked separately from `status` and gets its
   * own error code: unlike a genuinely unknown/suspended slug, this salon
   * exists and is operating — the frontend renders a distinct, friendlier
   * message for it rather than folding it into the generic "not found" case.
   */
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
    if (!tenant.customerBookingEnabled) {
      throw new ApiError({
        statusCode: 403,
        code: "SALON_BOOKING_DISABLED",
        message: "This salon isn't accepting online bookings right now.",
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

  /**
   * All four upload constraints run here, in this order, before anything
   * reaches Cloudinary — a rejected upload never spends a free-tier credit.
   * File type is proven from the buffer's own magic bytes (`detectImage`),
   * not the client-supplied `mimetype`, which is trivially spoofable.
   */
  async uploadLogo(tenantId: string, buffer: Buffer): Promise<TenantSettings> {
    if (buffer.byteLength > LOGO_MAX_BYTES) {
      throw new ApiError({
        statusCode: 400,
        code: "LOGO_FILE_TOO_LARGE",
        message: `That file is too large — the limit is ${LOGO_MAX_BYTES / 1_000_000} MB.`,
      });
    }

    const detected = detectImage(buffer);
    if (!detected) {
      throw new ApiError({
        statusCode: 400,
        code: "LOGO_INVALID_FILE_TYPE",
        message: "That isn't a PNG, JPEG or WebP image.",
      });
    }

    const { width, height } = detected;
    if (width < LOGO_MIN_DIMENSION || height < LOGO_MIN_DIMENSION || width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) {
      throw new ApiError({
        statusCode: 400,
        code: "LOGO_DIMENSIONS_OUT_OF_RANGE",
        message: `Image dimensions must be between ${LOGO_MIN_DIMENSION}×${LOGO_MIN_DIMENSION} and ${LOGO_MAX_DIMENSION}×${LOGO_MAX_DIMENSION}px.`,
      });
    }

    const ratio = width / height;
    if (ratio > LOGO_MAX_ASPECT_RATIO || ratio < 1 / LOGO_MAX_ASPECT_RATIO) {
      throw new ApiError({
        statusCode: 400,
        code: "LOGO_ASPECT_RATIO_INVALID",
        message: "That's a banner shape, not a logo mark — keep it within 2:1.",
      });
    }

    const tenant = await this.findById(tenantId);
    const logoUrl = await this.cloudinary.uploadLogo(buffer, `salon-logos/${tenant.slug}`);
    tenant.settings = { ...tenant.settings, logoUrl };
    await this.tenants.save(tenant);
    return tenant.settings;
  }

  /** No Cloudinary-side delete — an orphaned free-tier asset is an accepted, documented gap (DECISIONS.md). */
  async removeLogo(tenantId: string): Promise<TenantSettings> {
    const tenant = await this.findById(tenantId);
    tenant.settings = { ...tenant.settings, logoUrl: null };
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