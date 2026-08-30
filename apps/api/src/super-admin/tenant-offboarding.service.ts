import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, EntityManager, In, IsNull, Not, Repository } from "typeorm";
import { ApiError, AppointmentStatus } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { Customer } from "../entities/customer.entity";
import { CustomerAccountSalonLink } from "../entities/customer-account-salon-link.entity";
import { Inquiry } from "../entities/inquiry.entity";
import { Staff } from "../entities/staff.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
import { UserStatus } from "../enums/user-status.enum";
// AuditService/PlatformAlertService must stay VALUE imports: same DI reason.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PlatformAlertService } from "../alerting/platform-alert.service";

/** Mirrors `NOT_A_LIVE_BOOKING` in super-admin.service.ts / booking.service.ts — what an active booking actually counts as. */
const NOT_A_LIVE_BOOKING: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
  AppointmentStatus.PENDING_PAYMENT,
];

const RETENTION_DAYS = 90;

export interface DeactivateTenantResult {
  id: string;
  status: TenantStatus;
  slug: string;
  deletionRequestedAt: Date;
  purgeEligibleAt: Date;
  /** Informational only — deactivation never blocks on or touches these (locked decision: "leave as-is"). */
  futureAppointmentCount: number;
}

/**
 * Salon offboarding: deactivate (reversible) -> 90-day retention -> purge
 * (anonymize PII, never touch payment/appointment/refund/audit rows —
 * CLAUDE.md's "no hard deletes on business records" rule). See
 * DECISIONS.md's salon-offboarding entry for the full design and why each
 * of these three stages exists separately.
 */
@Injectable()
export class TenantOffboardingService {
  private readonly logger = new Logger(TenantOffboardingService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly alerts: PlatformAlertService,
  ) {}

  async deactivate(tenantId: string, reason: string | undefined, actorUserId: string): Promise<DeactivateTenantResult> {
    const tenant = await this.findOwned(tenantId);
    if (tenant.deletionRequestedAt) {
      throw new ApiError({
        statusCode: 409,
        code: "TENANT_ALREADY_DEACTIVATED",
        message: "This salon is already deactivated.",
      });
    }

    const now = new Date();
    const renamedSlug = this.renamedSlug(tenant.slug, now);

    tenant.status = TenantStatus.SUSPENDED;
    tenant.customerBookingEnabled = false;
    tenant.deletionRequestedAt = now;
    tenant.deactivationReason = reason ?? null;
    tenant.slug = renamedSlug;
    await this.tenants.save(tenant);

    const futureAppointmentCount = await this.countFutureAppointments(tenantId, now);
    const purgeEligibleAt = this.purgeEligibleDate(now);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TENANT_DEACTIVATED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { reason: reason ?? null, purgeEligibleAt: purgeEligibleAt.toISOString(), futureAppointmentCount },
    });

    void this.alerts.send(
      `Salon deactivated: ${tenant.name}`,
      [
        `${tenant.name} was deactivated by a platform admin.`,
        reason ? `Reason given: ${reason}` : "No reason was given.",
        futureAppointmentCount > 0
          ? `${futureAppointmentCount} future appointment(s) were left untouched and were not cancelled or refunded.`
          : "It had no future appointments outstanding.",
        `Its data will be eligible for automatic anonymization on ${purgeEligibleAt.toDateString()} unless it is reactivated first.`,
      ].join("\n"),
    );

    return {
      id: tenant.id,
      status: tenant.status,
      slug: tenant.slug,
      deletionRequestedAt: now,
      purgeEligibleAt,
      futureAppointmentCount,
    };
  }

  async reactivate(tenantId: string, actorUserId: string): Promise<Pick<Tenant, "id" | "status" | "slug" | "customerBookingEnabled">> {
    const tenant = await this.findOwned(tenantId);
    if (tenant.purgedAt) {
      throw new ApiError({
        statusCode: 409,
        code: "TENANT_ALREADY_PURGED",
        message: "This salon's data has already been anonymized and cannot be reactivated.",
      });
    }
    if (!tenant.deletionRequestedAt) {
      throw new ApiError({
        statusCode: 409,
        code: "TENANT_NOT_DEACTIVATED",
        message: "This salon is not currently deactivated.",
      });
    }

    const restoredSlug = await this.tryRestoreOriginalSlug(tenant.slug);

    tenant.status = TenantStatus.ACTIVE;
    tenant.customerBookingEnabled = true;
    tenant.deletionRequestedAt = null;
    tenant.deactivationReason = null;
    if (restoredSlug) {
      tenant.slug = restoredSlug;
    }
    await this.tenants.save(tenant);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TENANT_DEACTIVATION_CANCELLED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { slugRestored: restoredSlug !== null },
    });

    void this.alerts.send(
      `Salon reactivated: ${tenant.name}`,
      `${tenant.name} was reactivated by a platform admin before its 90-day retention window elapsed.${
        restoredSlug ? "" : " Its original booking link could not be restored (already taken) — it keeps the renamed one."
      }`,
    );

    return { id: tenant.id, status: tenant.status, slug: tenant.slug, customerBookingEnabled: tenant.customerBookingEnabled };
  }

  /** Manual immediate purge — a separate, deliberately-harder-to-reach action from ordinary deactivation. */
  async purgeNow(tenantId: string, actorUserId: string): Promise<{ id: string; purgedAt: Date }> {
    const tenant = await this.findOwned(tenantId);
    this.assertPurgeable(tenant);
    const purgedAt = await this.runPurge(tenant);
    await this.audit.record({
      tenantId,
      actorUserId,
      action: "TENANT_DATA_PURGED",
      entityType: "Tenant",
      entityId: tenantId,
      metadata: { trigger: "manual" },
    });
    void this.alerts.send(
      `Salon data purged: ${tenant.name}`,
      `A platform admin manually purged ${tenant.name}'s personal data (customers, staff, inquiries) ahead of its 90-day retention window. Payment, appointment, refund, and audit records were preserved, as required.`,
    );
    return { id: tenant.id, purgedAt };
  }

  /**
   * Off-peak daily sweep. Finds every tenant whose 90-day retention window
   * has elapsed and purges it the same way `purgeNow` does — this method IS
   * the scheduled trigger; `TenantScheduler` (or wherever `@Cron` lives)
   * calls it, kept here so the purge logic has exactly one implementation.
   */
  async runScheduledPurge(): Promise<{ purgedTenantIds: string[] }> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    const due = await this.tenants.find({
      where: { deletionRequestedAt: Not(IsNull()), purgedAt: IsNull() },
    });
    const purgedTenantIds: string[] = [];
    for (const tenant of due) {
      if (!tenant.deletionRequestedAt || tenant.deletionRequestedAt > cutoff) {
        continue;
      }
      try {
        await this.runPurge(tenant);
        await this.audit.record({
          tenantId: tenant.id,
          actorUserId: null,
          action: "TENANT_DATA_PURGED",
          entityType: "Tenant",
          entityId: tenant.id,
          metadata: { trigger: "scheduled" },
        });
        void this.alerts.send(
          `Salon data purged: ${tenant.name}`,
          `${tenant.name}'s 90-day retention window elapsed and its personal data was automatically anonymized. Payment, appointment, refund, and audit records were preserved, as required.`,
        );
        purgedTenantIds.push(tenant.id);
      } catch (err) {
        // One tenant failing to purge must never stop the sweep from
        // reaching the rest — same fire-and-forget-safety reasoning as
        // every other background job in this codebase.
        this.logger.error(`Scheduled purge failed for tenant ${tenant.id}`, err instanceof Error ? err.stack : undefined);
      }
    }
    return { purgedTenantIds };
  }

  private assertPurgeable(tenant: Tenant): void {
    if (tenant.purgedAt) {
      throw new ApiError({ statusCode: 409, code: "TENANT_ALREADY_PURGED", message: "This salon's data has already been purged." });
    }
    if (!tenant.deletionRequestedAt) {
      throw new ApiError({
        statusCode: 409,
        code: "TENANT_NOT_DEACTIVATED",
        message: "This salon must be deactivated before its data can be purged.",
      });
    }
  }

  /**
   * The actual anonymization. One transaction per tenant. Scrubs PII in
   * place; never deletes or touches Payment, Refund, Invoice, Appointment,
   * RetailSale, or AuditLog rows — every one of those is preserved exactly,
   * per CLAUDE.md's "no hard deletes on business records" rule. The `Tenant`
   * row itself is kept too (renamed, not deleted), so `AuditLog.tenantId`
   * keeps resolving to a real row forever.
   */
  private async runPurge(tenant: Tenant): Promise<Date> {
    const purgedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await this.anonymizeCustomers(manager, tenant.id);
      await this.anonymizeStaff(manager, tenant.id);
      await this.anonymizeInquiries(manager, tenant.id);
      await this.detachOrAnonymizeUsers(manager, tenant.id);
      await manager
        .getRepository(CustomerAccountSalonLink)
        .delete({ tenantId: tenant.id });

      await manager.getRepository(Tenant).update(tenant.id, {
        name: "Deleted Salon",
        deactivationReason: tenant.deactivationReason,
        purgedAt,
      });
    });
    tenant.purgedAt = purgedAt;
    return purgedAt;
  }

  private async anonymizeCustomers(manager: EntityManager, tenantId: string): Promise<void> {
    const customers = await manager.getRepository(Customer).find({ where: { tenantId }, select: { id: true } });
    await Promise.all(
      customers.map((c) =>
        manager.getRepository(Customer).update(c.id, {
          firstName: "Deleted",
          lastName: "Customer",
          // Both `phone` and `email` carry per-tenant unique indexes — a
          // fixed placeholder would collide across the first two customers
          // anonymized in the same tenant. Suffixing with the row's own id
          // keeps every value unique without needing a partial/where-scoped
          // index change.
          phone: `deleted-${c.id}`,
          email: `deleted-${c.id}@deleted.invalid`,
          notes: null,
          // Real PII added by the customer CRM feature — cleared the same as
          // name/phone/email/notes above. `title` and `clientSource` are left
          // alone: a bare salutation or "Referral" isn't identifying on its
          // own once the name/phone/email/address/photo/DOB are gone.
          dateOfBirth: null,
          address: null,
          province: null,
          profileImageUrl: null,
        }),
      ),
    );
  }

  private async anonymizeStaff(manager: EntityManager, tenantId: string): Promise<void> {
    await manager.getRepository(Staff).update({ tenantId }, { name: "Deleted Staff", phone: null });
  }

  private async anonymizeInquiries(manager: EntityManager, tenantId: string): Promise<void> {
    await manager.getRepository(Inquiry).update({ tenantId }, { notes: null });
  }

  /**
   * A `User` (staff/owner login) can in principle hold `UserTenantRole` rows
   * for more than one tenant, even though nothing in this codebase creates
   * that today — anonymizing the shared row outright would erase someone
   * else's still-active login. So: always remove this tenant's membership
   * row; only scrub the `User` row itself when this was its last tenant.
   */
  private async detachOrAnonymizeUsers(manager: EntityManager, tenantId: string): Promise<void> {
    const utrRepo = manager.getRepository(UserTenantRole);
    const links = await utrRepo.find({ where: { tenantId } });
    const userIds = [...new Set(links.map((l) => l.userId))];
    await utrRepo.delete({ tenantId });
    if (userIds.length === 0) {
      return;
    }

    const remainingElsewhere = await utrRepo.find({ where: { userId: In(userIds) }, select: { userId: true } });
    const stillLinkedElsewhere = new Set(remainingElsewhere.map((r) => r.userId));
    const soleTenantUserIds = userIds.filter((id) => !stillLinkedElsewhere.has(id));

    await Promise.all(
      soleTenantUserIds.map((id) =>
        manager.getRepository(User).update(id, {
          name: "Deleted User",
          email: `deleted-${id}@deleted.invalid`,
          status: UserStatus.DISABLED,
        }),
      ),
    );
  }

  private async countFutureAppointments(tenantId: string, now: Date): Promise<number> {
    return this.appointments
      .createQueryBuilder("a")
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."startTime" > :now', { now })
      .andWhere('a.status NOT IN (:...excluded)', { excluded: NOT_A_LIVE_BOOKING })
      .getCount();
  }

  private purgeEligibleDate(from: Date): Date {
    return new Date(from.getTime() + RETENTION_DAYS * 24 * 60 * 60_000);
  }

  /** `${slug}--removed-<epoch>` — frees the original slug immediately rather than making a new registration wait out the retention window. */
  private renamedSlug(slug: string, at: Date): string {
    return `${slug}--removed-${at.getTime()}`;
  }

  /** Null means "not free" — the caller keeps the renamed slug rather than failing the reactivation over a cosmetic detail. */
  private async tryRestoreOriginalSlug(renamedSlug: string): Promise<string | null> {
    const match = /^(.*)--removed-\d+$/.exec(renamedSlug);
    if (!match) {
      return null;
    }
    const original = match[1];
    const taken = await this.tenants.findOne({ where: { slug: original } });
    return taken ? null : original;
  }

  private async findOwned(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new ApiError({ statusCode: 404, code: "TENANT_NOT_FOUND", message: "Tenant not found." });
    }
    return tenant;
  }
}
