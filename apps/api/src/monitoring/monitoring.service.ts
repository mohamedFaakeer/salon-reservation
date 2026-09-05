import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, DataSource, In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from "typeorm";
import {
  ApiError,
  AppointmentStatus,
  NotificationStatus,
  PaymentStatus,
  SECURITY_EVENT_ACTIONS,
  type MonitoringErrorQueryDto,
  type MonitoringSecurityEventQueryDto,
  type MonitoringSeverity,
  type SecurityEventAction,
} from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { ErrorLog } from "../entities/error-log.entity";
import { Notification } from "../entities/notification.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";
import { Payment } from "../entities/payment.entity";
import { SecurityEventReview } from "../entities/security-event-review.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
// AuditService/CloudinaryService must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { resolveEmailTransport } from "../notification/providers/resolve-email-transport";
import { classifyErrorLogSeverity, classifySecurityEventSeverity } from "./classify-severity";
import { explainErrorLog, explainSecurityEvent } from "./explain-event";
import {
  classifyDatabaseError,
  classifyNotificationFailure,
  RECENT_FAILURE_WINDOW_MS,
  sanitizeMessage,
  type ServiceStatusEntry,
} from "./service-status";

/** Mirrors NOT_A_LIVE_BOOKING in super-admin.service.ts — what an active booking actually counts as, platform-wide. */
const NOT_A_LIVE_BOOKING: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
  AppointmentStatus.PENDING_PAYMENT,
];

const RECENT_WINDOW_MS = 10 * 60_000; // 10 minutes — the "is this a pattern" lookback for security events
const ERROR_RECENT_WINDOW_MS = 24 * 60 * 60_000; // 24 hours — errors recur on a slower cadence than login attempts

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface MonitoringOverview {
  activeTenants: number;
  bookingsThisMonth: number;
  /**
   * Summed across tenants without currency conversion — correct today
   * because every tenant defaults to LKR (Sri Lanka MVP, CLAUDE.md's own
   * "multi-country tax" is explicitly out of scope); would need real
   * conversion the day a non-LKR tenant exists.
   */
  revenueThisMonthCents: number;
  tenantsNearQuota: number;
  securityEventCounts: { last24h: number; last7d: number };
  openErrorCount: number;
}

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(NotificationQuota) private readonly quotas: Repository<NotificationQuota>,
    @InjectRepository(ErrorLog) private readonly errorLogs: Repository<ErrorLog>,
    @InjectRepository(SecurityEventReview) private readonly reviews: Repository<SecurityEventReview>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async overview(): Promise<MonitoringOverview> {
    const now = new Date();
    const monthStart = startOfMonthUtc(now);
    const day24hAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const day7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const monthKey = now.toISOString().slice(0, 7);

    const [activeTenants, bookingsThisMonth, revenue, quotaRows, count24h, count7d, openErrorCount] =
      await Promise.all([
        this.tenants.count({ where: { status: TenantStatus.ACTIVE } }),
        this.appointments
          .createQueryBuilder("a")
          .where('a."createdAt" >= :monthStart', { monthStart })
          .andWhere('a.status NOT IN (:...excluded)', { excluded: NOT_A_LIVE_BOOKING })
          .getCount(),
        this.payments
          .createQueryBuilder("p")
          .select('COALESCE(SUM(p."amountCents"), 0)::int', "total")
          .where("p.state = :state", { state: PaymentStatus.SUCCESS })
          .andWhere('COALESCE(p."recordedAt", p."createdAt") >= :monthStart', { monthStart })
          .getRawOne<{ total: number }>(),
        this.quotas.find({ where: { month: monthKey } }),
        this.audit.queryAcrossTenants({
          actions: [...SECURITY_EVENT_ACTIONS],
          from: day24hAgo.toISOString(),
          limit: 1,
          offset: 0,
        }),
        this.audit.queryAcrossTenants({
          actions: [...SECURITY_EVENT_ACTIONS],
          from: day7dAgo.toISOString(),
          limit: 1,
          offset: 0,
        }),
        this.errorLogs.count({ where: { status: Not("RESOLVED") } }),
      ]);

    const tenantsNearQuota = new Set(
      quotaRows
        .filter(
          (q) =>
            (q.emailLimit > 0 && q.emailSent / q.emailLimit >= 0.8) ||
            (q.smsLimit > 0 && q.smsSent / q.smsLimit >= 0.8) ||
            (q.whatsappLimit > 0 && q.whatsappSent / q.whatsappLimit >= 0.8),
        )
        .map((q) => q.tenantId),
    ).size;

    return {
      activeTenants,
      bookingsThisMonth,
      revenueThisMonthCents: Number(revenue?.total ?? 0),
      tenantsNearQuota,
      securityEventCounts: { last24h: count24h.meta.total, last7d: count7d.meta.total },
      openErrorCount,
    };
  }

  /** Per-tenant rollup: this month's bookings/revenue, email/SMS usage vs. limit, last staff login. */
  async tenantUsage(query: { limit: number; offset: number }): Promise<{
    data: Array<{
      tenantId: string;
      name: string;
      slug: string;
      bookingsThisMonth: number;
      revenueThisMonthCents: number;
      emailUsage: { sent: number; limit: number };
      smsUsage: { sent: number; limit: number };
      lastStaffLoginAt: Date | null;
      lockedAccountCount: number;
    }>;
    meta: { total: number; limit: number; offset: number };
  }> {
    const [tenantRows, total] = await this.tenants.findAndCount({
      order: { name: "ASC" },
      take: query.limit,
      skip: query.offset,
    });
    if (tenantRows.length === 0) {
      return { data: [], meta: { total, limit: query.limit, offset: query.offset } };
    }

    const tenantIds = tenantRows.map((t) => t.id);
    const monthStart = startOfMonthUtc(new Date());
    const monthKey = new Date().toISOString().slice(0, 7);

    const [bookingRows, revenueRows, quotaRows, lastLoginRows, lockedRows] = await Promise.all([
      this.appointments
        .createQueryBuilder("a")
        .select('a."tenantId"', "tenantId")
        .addSelect("COUNT(*)::int", "count")
        .where('a."tenantId" IN (:...tenantIds)', { tenantIds })
        .andWhere('a."createdAt" >= :monthStart', { monthStart })
        .andWhere('a.status NOT IN (:...excluded)', { excluded: NOT_A_LIVE_BOOKING })
        .groupBy('a."tenantId"')
        .getRawMany<{ tenantId: string; count: number }>(),
      this.payments
        .createQueryBuilder("p")
        .select('p."tenantId"', "tenantId")
        .addSelect('COALESCE(SUM(p."amountCents"), 0)::int', "total")
        .where('p."tenantId" IN (:...tenantIds)', { tenantIds })
        .andWhere("p.state = :state", { state: PaymentStatus.SUCCESS })
        .andWhere('COALESCE(p."recordedAt", p."createdAt") >= :monthStart', { monthStart })
        .groupBy('p."tenantId"')
        .getRawMany<{ tenantId: string; total: number }>(),
      this.quotas.find({ where: { tenantId: In(tenantIds), month: monthKey } }),
      this.users
        .createQueryBuilder("u")
        .innerJoin("user_tenant_role", "utr", 'utr."userId" = u.id')
        .select('utr."tenantId"', "tenantId")
        .addSelect('MAX(u."lastLoginAt")', "lastLoginAt")
        .where('utr."tenantId" IN (:...tenantIds)', { tenantIds })
        .groupBy('utr."tenantId"')
        .getRawMany<{ tenantId: string; lastLoginAt: Date | null }>(),
      // Live, current count — not a rollup of past ACCOUNT_LOCKED events
      // (those already surface individually in the Security events tab).
      // A plain COUNT of `status = 'LOCKED'` needs no time window and
      // self-corrects the moment any of them is reset.
      this.users
        .createQueryBuilder("u")
        .innerJoin("user_tenant_role", "utr", 'utr."userId" = u.id')
        .select('utr."tenantId"', "tenantId")
        .addSelect("COUNT(*)::int", "count")
        .where('utr."tenantId" IN (:...tenantIds)', { tenantIds })
        .andWhere("u.status = :locked", { locked: "LOCKED" })
        .groupBy('utr."tenantId"')
        .getRawMany<{ tenantId: string; count: number }>(),
    ]);

    const bookingsByTenant = new Map(bookingRows.map((r) => [r.tenantId, Number(r.count)]));
    const revenueByTenant = new Map(revenueRows.map((r) => [r.tenantId, Number(r.total)]));
    const quotaByTenant = new Map(quotaRows.map((q) => [q.tenantId, q]));
    const lastLoginByTenant = new Map(lastLoginRows.map((r) => [r.tenantId, r.lastLoginAt]));
    const lockedByTenant = new Map(lockedRows.map((r) => [r.tenantId, Number(r.count)]));

    return {
      data: tenantRows.map((t) => {
        const quota = quotaByTenant.get(t.id);
        return {
          tenantId: t.id,
          name: t.name,
          slug: t.slug,
          bookingsThisMonth: bookingsByTenant.get(t.id) ?? 0,
          revenueThisMonthCents: revenueByTenant.get(t.id) ?? 0,
          emailUsage: { sent: quota?.emailSent ?? 0, limit: quota?.emailLimit ?? 0 },
          smsUsage: { sent: quota?.smsSent ?? 0, limit: quota?.smsLimit ?? 0 },
          lastStaffLoginAt: lastLoginByTenant.get(t.id) ?? null,
          lockedAccountCount: lockedByTenant.get(t.id) ?? 0,
        };
      }),
      meta: { total, limit: query.limit, offset: query.offset },
    };
  }

  async listErrors(query: MonitoringErrorQueryDto): Promise<{
    data: Array<ErrorLog & { severity: MonitoringSeverity; title: string; plainLanguage: string; recommendedAction: string; tenantName: string | null }>;
    meta: { total: number; limit: number; offset: number };
  }> {
    const where: Record<string, unknown> = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;
    if (query.from && query.to) {
      where.createdAt = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    const [rows, total] = await this.errorLogs.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    if (rows.length === 0) {
      return { data: [], meta: { total, limit: query.limit, offset: query.offset } };
    }

    const since = new Date(Date.now() - ERROR_RECENT_WINDOW_MS);
    const recentCounts = await this.errorLogs
      .createQueryBuilder("e")
      .select("e.code", "code")
      .addSelect("e.path", "path")
      .addSelect("COUNT(*)::int", "count")
      .where('e."createdAt" >= :since', { since })
      .groupBy("e.code")
      .addGroupBy("e.path")
      .getRawMany<{ code: string; path: string; count: number }>();
    const countKey = (code: string, path: string) => `${code}|${path}`;
    const recentByKey = new Map(recentCounts.map((r) => [countKey(r.code, r.path), Number(r.count)]));

    const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((id): id is string => id !== null))];
    const tenantNames = tenantIds.length
      ? new Map((await this.tenants.find({ where: { id: In(tenantIds) }, select: { id: true, name: true } })).map((t) => [t.id, t.name]))
      : new Map<string, string>();

    return {
      data: rows.map((row) => {
        const recentCount = recentByKey.get(countKey(row.code, row.path)) ?? 1;
        const severity = classifyErrorLogSeverity(row.statusCode, recentCount);
        const tenantName = row.tenantId ? (tenantNames.get(row.tenantId) ?? null) : null;
        const explanation = explainErrorLog({ statusCode: row.statusCode, code: row.code, path: row.path, tenantName, recentCount });
        return { ...row, severity, tenantName, ...explanation };
      }),
      meta: { total, limit: query.limit, offset: query.offset },
    };
  }

  async updateErrorStatus(id: string, status: "ACKNOWLEDGED" | "RESOLVED"): Promise<ErrorLog> {
    const row = await this.errorLogs.findOne({ where: { id } });
    if (!row) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Error log entry not found." });
    }
    row.status = status;
    return this.errorLogs.save(row);
  }

  async listSecurityEvents(query: MonitoringSecurityEventQueryDto): Promise<{
    data: Array<{
      id: string;
      action: string;
      /** The audited entity's id (e.g. the locked User's id for ACCOUNT_LOCKED) — lets the UI act on the specific account, not just describe it. */
      entityId: string;
      tenantId: string | null;
      tenantName: string | null;
      createdAt: Date;
      ipAddress: string | null;
      severity: MonitoringSeverity;
      status: "NEW" | "ACKNOWLEDGED" | "RESOLVED";
      title: string;
      plainLanguage: string;
      recommendedAction: string;
      metadata: Record<string, unknown>;
    }>;
    meta: { total: number; limit: number; offset: number };
  }> {
    const actions = query.action ? [query.action] : [...SECURITY_EVENT_ACTIONS];
    const { data: rows, meta } = await this.audit.queryAcrossTenants({
      tenantId: query.tenantId,
      actions,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });
    if (rows.length === 0) {
      return { data: [], meta };
    }

    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const byAction = new Map<string, string[]>();
    for (const row of rows) {
      const ids = byAction.get(row.action) ?? [];
      ids.push(row.entityId);
      byAction.set(row.action, ids);
    }
    const recentCounts = new Map<string, Map<string, number>>();
    await Promise.all(
      [...byAction.entries()].map(async ([action, entityIds]) => {
        recentCounts.set(action, await this.audit.countRecentByEntity(action, entityIds, since));
      }),
    );

    const auditLogIds = rows.map((r) => r.id);
    const reviewRows = await this.reviews.find({ where: { auditLogId: In(auditLogIds) } });
    const statusByAuditLogId = new Map(reviewRows.map((r) => [r.auditLogId, r.status]));

    return {
      data: rows.map((row) => {
        const action = row.action as SecurityEventAction;
        const recentCount = recentCounts.get(row.action)?.get(row.entityId) ?? 1;
        const severity = classifySecurityEventSeverity(action, recentCount);
        const actorName =
          row.actorUser?.name ??
          (typeof row.metadata.attemptedEmail === "string" ? row.metadata.attemptedEmail : null) ??
          (typeof row.metadata.attemptedPhone === "string" ? row.metadata.attemptedPhone : null);
        const tenantName = row.tenant?.name ?? null;
        const explanation = explainSecurityEvent({ action, actorName, tenantName, recentCount, metadata: row.metadata });
        return {
          id: row.id,
          action: row.action,
          entityId: row.entityId,
          tenantId: row.tenantId,
          tenantName,
          createdAt: row.createdAt,
          ipAddress: row.ipAddress,
          severity,
          status: statusByAuditLogId.get(row.id) ?? "NEW",
          metadata: row.metadata,
          ...explanation,
        };
      }),
      meta,
    };
  }

  async updateSecurityEventStatus(
    auditLogId: string,
    status: "ACKNOWLEDGED" | "RESOLVED",
    reviewedByUserId: string,
  ): Promise<{ auditLogId: string; status: string }> {
    const existing = await this.reviews.findOne({ where: { auditLogId } });
    if (existing) {
      existing.status = status;
      existing.reviewedByUserId = reviewedByUserId;
      await this.reviews.save(existing);
    } else {
      await this.reviews.save(this.reviews.create({ auditLogId, status, reviewedByUserId }));
    }
    return { auditLogId, status };
  }

  /**
   * "Service status" tab (resilience audit follow-up): each dependency's
   * current state, plus whether a problem looks like ours to fix or the
   * provider's to wait out. Deliberately reads only data already being
   * written today — no new outbound call to Cloudinary/Brevo/Text.lk, so no
   * new cost, rate-limit exposure, or attack surface on any of them. The
   * database is the one real live check (a cheap, bounded `SELECT 1`),
   * since that's the one dependency with no existing failure-history table
   * to read instead.
   */
  async serviceStatus(): Promise<{ data: ServiceStatusEntry[] }> {
    const now = new Date();
    const [database, cloudinary, email, sms] = await Promise.all([
      this.checkDatabase(now),
      this.checkCloudinary(now),
      this.checkNotificationChannel("email", "Email (Brevo)", resolveEmailTransport() !== null, now),
      this.checkNotificationChannel(
        "sms",
        "SMS (Text.lk)",
        Boolean(process.env.TEXTLK_API_TOKEN?.trim() && process.env.TEXTLK_SENDER_ID?.trim()),
        now,
      ),
    ]);

    // Neither has a live external call today (ManualProvider makes none;
    // PayHere is an unused stub) and the API can't self-report on its own
    // host — both stay permanently informational rather than pretending to
    // check something that doesn't exist yet.
    const hosting: ServiceStatusEntry = {
      id: "hosting",
      label: "Hosting (Render)",
      status: "not_applicable",
      origin: null,
      message: "This page loading at all already proves the API is up — it can't meaningfully report on its own host.",
      lastCheckedAt: now.toISOString(),
      lastErrorAt: null,
    };
    const payments: ServiceStatusEntry = {
      id: "payments",
      label: "Payments",
      status: "not_applicable",
      origin: null,
      message: "No live payment gateway in use — payments are recorded manually, nothing external to check.",
      lastCheckedAt: now.toISOString(),
      lastErrorAt: null,
    };

    return { data: [database, cloudinary, email, sms, hosting, payments] };
  }

  private async checkDatabase(now: Date): Promise<ServiceStatusEntry> {
    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Database health check timed out")), 3_000);
        }),
      ]);
      return {
        id: "database",
        label: "Database",
        status: "healthy",
        origin: null,
        message: "Reachable.",
        lastCheckedAt: now.toISOString(),
        lastErrorAt: null,
      };
    } catch (err) {
      const { origin, message } = classifyDatabaseError(err);
      return {
        id: "database",
        label: "Database",
        status: "down",
        origin,
        message,
        lastCheckedAt: now.toISOString(),
        lastErrorAt: now.toISOString(),
      };
    }
  }

  private async checkCloudinary(now: Date): Promise<ServiceStatusEntry> {
    if (!this.cloudinary.isConfigured) {
      return {
        id: "cloudinary",
        label: "Cloudinary (images)",
        status: "not_configured",
        origin: "ours",
        message: "No Cloudinary credentials set — logo and photo uploads are disabled.",
        lastCheckedAt: now.toISOString(),
        lastErrorAt: null,
      };
    }

    const since = new Date(now.getTime() - RECENT_FAILURE_WINDOW_MS);
    const recentFailure = await this.errorLogs
      .createQueryBuilder("e")
      .where('e."createdAt" >= :since', { since })
      .andWhere("(e.code LIKE :failed OR e.code LIKE :notConfigured)", {
        failed: "%UPLOAD_FAILED",
        notConfigured: "%UPLOAD_NOT_CONFIGURED",
      })
      .orderBy('e."createdAt"', "DESC")
      .getOne();

    if (recentFailure) {
      return {
        id: "cloudinary",
        label: "Cloudinary (images)",
        status: "degraded",
        // A configured integration failing is most likely transient on
        // their end — `error_log.message` here is our own user-facing
        // string (never the raw SDK cause), so there's no finer-grained
        // signal available to distinguish auth vs. network failure.
        origin: "provider",
        message: "An upload failed recently — likely a transient issue on Cloudinary's end.",
        lastCheckedAt: now.toISOString(),
        lastErrorAt: recentFailure.createdAt.toISOString(),
      };
    }

    return {
      id: "cloudinary",
      label: "Cloudinary (images)",
      status: "healthy",
      origin: null,
      message: "Configured, and no failed uploads in the last 30 minutes.",
      lastCheckedAt: now.toISOString(),
      lastErrorAt: null,
    };
  }

  private async checkNotificationChannel(
    channel: "email" | "sms",
    label: string,
    configured: boolean,
    now: Date,
  ): Promise<ServiceStatusEntry> {
    if (!configured) {
      return {
        id: channel,
        label,
        status: "not_configured",
        origin: "ours",
        message: `No ${label} credentials set — falls back to console logging only.`,
        lastCheckedAt: now.toISOString(),
        lastErrorAt: null,
      };
    }

    const since = new Date(now.getTime() - RECENT_FAILURE_WINDOW_MS);
    const recentFailure = await this.notifications
      .createQueryBuilder("n")
      .where("n.channel = :channel", { channel })
      .andWhere("n.status = :status", { status: NotificationStatus.FAILED })
      .andWhere('n."updatedAt" >= :since', { since })
      .orderBy('n."updatedAt"', "DESC")
      .getOne();

    if (recentFailure?.lastError) {
      const { origin, skip } = classifyNotificationFailure(recentFailure.lastError);
      if (!skip) {
        return {
          id: channel,
          label,
          status: "degraded",
          origin,
          message: sanitizeMessage(recentFailure.lastError),
          lastCheckedAt: now.toISOString(),
          lastErrorAt: recentFailure.updatedAt.toISOString(),
        };
      }
    }

    return {
      id: channel,
      label,
      status: "healthy",
      origin: null,
      message: "Configured, and no failed sends in the last 30 minutes.",
      lastCheckedAt: now.toISOString(),
      lastErrorAt: null,
    };
  }
}
