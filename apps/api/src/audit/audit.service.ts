import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { SECURITY_EVENT_ACTIONS, type AuditQueryDto, type SecurityEventAction } from "@salon/shared";
import { AuditLog } from "../entities/audit-log.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
// PlatformAlertService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PlatformAlertService } from "../alerting/platform-alert.service";
import { classifySecurityEventSeverity } from "../monitoring/classify-severity";
import { explainSecurityEvent } from "../monitoring/explain-event";

const ALERT_LOOKBACK_MS = 10 * 60_000; // matches monitoring.service.ts's RECENT_WINDOW_MS

export interface RecordAuditInput {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly alerts: PlatformAlertService,
  ) {}

  /**
   * Awaited by every caller — a failed audit write is a real error, not
   * silently swallowed. Pass `manager` to make the write atomic with a
   * caller's own transaction (same optional-manager pattern as
   * TenantService.createTenant).
   *
   * Security-relevant actions (the 4 in `SECURITY_EVENT_ACTIONS`) also get
   * evaluated for an immediate email alert here — this is the one place
   * every one of them passes through, so it's also the one place that
   * decides whether a human needs to know right now. Per the user's
   * explicit instruction: only HIGH/CRITICAL severity emails immediately;
   * everything else (including every LOW/MEDIUM security event) stays
   * dashboard-only, which is what the monitoring feature is for.
   */
  async record(input: RecordAuditInput, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.logs;
    const saved = await repo.save(
      repo.create({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? {},
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      }),
    );

    if ((SECURITY_EVENT_ACTIONS as readonly string[]).includes(input.action)) {
      // Never let alert evaluation — an extra query plus an email send —
      // turn a successful audit write into a failed request for the caller.
      this.maybeAlert(saved).catch((err: unknown) => {
        this.logger.error("Security-event alert evaluation failed", err instanceof Error ? err.stack : undefined);
      });
    }
  }

  private async maybeAlert(row: AuditLog): Promise<void> {
    const action = row.action as SecurityEventAction;
    const since = new Date(Date.now() - ALERT_LOOKBACK_MS);
    const recentCount = (await this.countRecentByEntity(action, [row.entityId], since)).get(row.entityId) ?? 1;
    const severity = classifySecurityEventSeverity(action, recentCount);
    if (severity !== "CRITICAL" && severity !== "HIGH") {
      return;
    }

    const [actorUser, tenant] = await Promise.all([
      row.actorUserId ? this.users.findOne({ where: { id: row.actorUserId }, select: { id: true, name: true } }) : null,
      row.tenantId ? this.tenants.findOne({ where: { id: row.tenantId }, select: { id: true, name: true } }) : null,
    ]);
    const actorName =
      actorUser?.name ??
      (typeof row.metadata.attemptedEmail === "string" ? row.metadata.attemptedEmail : null) ??
      (typeof row.metadata.attemptedPhone === "string" ? row.metadata.attemptedPhone : null);

    const explanation = explainSecurityEvent({
      action,
      actorName,
      tenantName: tenant?.name ?? null,
      recentCount,
      metadata: row.metadata,
    });

    await this.alerts.send(
      `[${severity}] ${explanation.title}`,
      `${explanation.plainLanguage}\n\n${explanation.recommendedAction}\n\nOpen the platform monitoring dashboard for full details.`,
    );
  }

  async query(
    tenantId: string,
    filters: AuditQueryDto,
  ): Promise<{ data: AuditLog[]; meta: { total: number; limit: number; offset: number } }> {
    const where: Record<string, unknown> = { tenantId };
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters.from && filters.to) {
      where.createdAt = Between(new Date(filters.from), new Date(filters.to));
    } else if (filters.from) {
      where.createdAt = MoreThanOrEqual(new Date(filters.from));
    } else if (filters.to) {
      where.createdAt = LessThanOrEqual(new Date(filters.to));
    }

    const [data, total] = await this.logs.findAndCount({
      where,
      // Without the actor joined, every row reads as a UUID doing something to
      // another UUID — which answers none of the questions an audit log exists
      // to answer.
      //
      // The select is explicit and must stay that way: User carries
      // `passwordHash` with no `select: false`, so an unscoped join would
      // serialise every actor's argon2 hash into this response.
      relations: { actorUser: true },
      select: {
        id: true,
        tenantId: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        actorUser: { id: true, name: true, email: true },
      },
      order: { createdAt: "DESC" },
      take: filters.limit,
      skip: filters.offset,
    });

    return { data, meta: { total, limit: filters.limit, offset: filters.offset } };
  }

  /**
   * The cross-tenant counterpart to `query()` — for the super-admin
   * monitoring feature, which needs to see security events across every
   * salon, not just one. `query()` itself stays untouched and mandatorily
   * tenant-scoped for the existing OWNER/MANAGER-facing endpoint; this is a
   * separate method rather than an optional-tenantId overload so it's
   * impossible to accidentally call the tenant-scoped path without a
   * tenantId and get every tenant's data back.
   */
  async queryAcrossTenants(filters: {
    tenantId?: string;
    actions?: string[];
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  }): Promise<{ data: AuditLog[]; meta: { total: number; limit: number; offset: number } }> {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }
    if (filters.actions && filters.actions.length > 0) {
      where.action = filters.actions.length === 1 ? filters.actions[0] : In(filters.actions);
    }
    if (filters.from && filters.to) {
      where.createdAt = Between(new Date(filters.from), new Date(filters.to));
    } else if (filters.from) {
      where.createdAt = MoreThanOrEqual(new Date(filters.from));
    } else if (filters.to) {
      where.createdAt = LessThanOrEqual(new Date(filters.to));
    }

    const [data, total] = await this.logs.findAndCount({
      where,
      relations: { actorUser: true, tenant: true },
      select: {
        id: true,
        tenantId: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        actorUser: { id: true, name: true, email: true },
        tenant: { id: true, name: true },
      },
      order: { createdAt: "DESC" },
      take: filters.limit,
      skip: filters.offset,
    });

    return { data, meta: { total, limit: filters.limit, offset: filters.offset } };
  }

  /**
   * How many times `action` has fired for the same `entityId` since `since`
   * — the "is this an isolated event or a pattern" count that drives
   * severity classification (see `classify-severity.ts`), computed with one
   * grouped query per distinct entityId rather than once per row.
   */
  async countRecentByEntity(
    action: string,
    entityIds: string[],
    since: Date,
  ): Promise<Map<string, number>> {
    if (entityIds.length === 0) {
      return new Map();
    }
    const rows = await this.logs
      .createQueryBuilder("a")
      .select('a."entityId"', "entityId")
      .addSelect("COUNT(*)", "count")
      .where("a.action = :action", { action })
      .andWhere('a."entityId" IN (:...entityIds)', { entityIds })
      .andWhere('a."createdAt" >= :since', { since })
      .groupBy('a."entityId"')
      .getRawMany<{ entityId: string; count: string }>();
    return new Map(rows.map((r) => [r.entityId, Number(r.count)]));
  }
}
