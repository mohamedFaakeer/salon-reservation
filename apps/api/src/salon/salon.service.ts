import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MoreThanOrEqual, Repository } from "typeorm";
import { AdvanceRule, type TenantSettings } from "@salon/shared";
import { Tenant } from "../entities/tenant.entity";
import { Branch } from "../entities/branch.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { Closure } from "../entities/closure.entity";
import { TenantStatus } from "../enums/tenant-status.enum";
// TenantService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";

export interface SalonListItem {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  servicesCount: number;
  /** Cheapest active service, so a card can say what a visit starts at. */
  priceFromCents: number | null;
  /** The first three by name — enough for a card to show what the salon does. */
  topServices: string[];
}

export interface SalonHoursEntry {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface SalonProfile {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  services: Array<{ id: string; name: string; category: string | null; durationMin: number; priceCents: number }>;
  staff: Array<{ id: string; name: string }>;
  /** Derived from the union of active staff schedules — no tenant-level "hours" column exists. Null = closed that day. */
  hours: Array<SalonHoursEntry | null>;
  advanceRuleLabel: string;
  cancellationPolicySummary: string;
  closures: Array<{ name: string; startDate: string; endDate: string }>;
}

@Injectable()
export class SalonService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(WorkingSchedule) private readonly schedules: Repository<WorkingSchedule>,
    @InjectRepository(Closure) private readonly closures: Repository<Closure>,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Public salon list, optionally filtered by `q` against name and city
   * (UX.md §3.2: "Search = name/city").
   *
   * The filter is applied in the database rather than over the assembled
   * cards, so a search never pays to build cards it is about to discard.
   */
  async list(q?: string): Promise<SalonListItem[]> {
    const query = this.tenants
      .createQueryBuilder("t")
      .leftJoin(Branch, "b", 'b."tenantId" = t.id AND b.active = true')
      .where("t.status = :status", { status: TenantStatus.ACTIVE })
      .orderBy("t.name", "ASC");

    const term = q?.trim();
    if (term) {
      query.andWhere('(t.name ILIKE :q OR b.city ILIKE :q)', { q: `%${term}%` });
    }

    const activeTenants = await query.getMany();

    return Promise.all(
      activeTenants.map(async (tenant) => {
        const [branch, services] = await Promise.all([
          this.branches.findOne({ where: { tenantId: tenant.id, active: true } }),
          this.services.find({
            where: { tenantId: tenant.id, active: true },
            order: { name: "ASC" },
          }),
        ]);
        return {
          slug: tenant.slug,
          name: tenant.name,
          address: branch?.address ?? null,
          city: branch?.city ?? null,
          servicesCount: services.length,
          priceFromCents:
            services.length > 0 ? Math.min(...services.map((s) => s.priceCents)) : null,
          topServices: services.slice(0, 3).map((s) => s.name),
        };
      }),
    );
  }

  async profile(slug: string): Promise<SalonProfile> {
    const tenant = await this.tenantService.findActiveBySlug(slug);

    const [branch, services, staff, closures] = await Promise.all([
      this.branches.findOne({ where: { tenantId: tenant.id, active: true } }),
      this.services.find({ where: { tenantId: tenant.id, active: true }, order: { name: "ASC" } }),
      this.staff.find({ where: { tenantId: tenant.id, active: true }, order: { name: "ASC" } }),
      this.closures.find({
        where: { tenantId: tenant.id, endDate: MoreThanOrEqual(todayLocalDate()) },
        order: { startDate: "ASC" },
      }),
    ]);

    const hours = await this.deriveHours(tenant.id, staff.map((s) => s.id));

    return {
      slug: tenant.slug,
      name: tenant.name,
      address: branch?.address ?? null,
      city: branch?.city ?? null,
      phone: branch?.phone ?? null,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        durationMin: s.durationMin,
        priceCents: s.priceCents,
      })),
      staff: staff.map((s) => ({ id: s.id, name: s.name })),
      hours,
      advanceRuleLabel: formatAdvanceRule(tenant.settings),
      cancellationPolicySummary: formatCancellationPolicy(tenant.settings.cancellationPolicy),
      closures: closures.map((c) => ({ name: c.name, startDate: c.startDate, endDate: c.endDate })),
    };
  }

  /** Union across active staff: earliest start / latest end per weekday that has at least one staff scheduled. */
  private async deriveHours(tenantId: string, staffIds: string[]): Promise<Array<SalonHoursEntry | null>> {
    const hours: Array<SalonHoursEntry | null> = [null, null, null, null, null, null, null];
    if (staffIds.length === 0) {
      return hours;
    }
    const rows = await this.schedules.find({ where: { tenantId } });
    for (const row of rows) {
      if (!staffIds.includes(row.staffId)) {
        continue;
      }
      const existing = hours[row.dayOfWeek];
      hours[row.dayOfWeek] = existing
        ? { dayOfWeek: row.dayOfWeek, startMin: Math.min(existing.startMin, row.startMin), endMin: Math.max(existing.endMin, row.endMin) }
        : { dayOfWeek: row.dayOfWeek, startMin: row.startMin, endMin: row.endMin };
    }
    return hours;
  }
}

function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The customer-facing sentence for the advance rule.
 *
 * Takes the whole settings object because the two value fields are not
 * interchangeable: FIXED_AMOUNT reads `advanceValueCents`, PERCENTAGE reads
 * `advancePercent`, and `PricingService.computeRawAdvance` charges on exactly
 * that split. Reading cents under PERCENTAGE (as this did) always found null
 * and promised customers "0% advance required" while the engine charged the
 * real percentage.
 */
function formatAdvanceRule(settings: TenantSettings): string {
  switch (settings.advanceRule) {
    case AdvanceRule.NO_ADVANCE:
      return "No advance required";
    case AdvanceRule.FIXED_AMOUNT:
      return `Rs. ${((settings.advanceValueCents ?? 0) / 100).toFixed(0)} advance required`;
    case AdvanceRule.PERCENTAGE:
      return `${settings.advancePercent ?? 0}% advance required`;
    case AdvanceRule.FULL_PAYMENT:
      return "Full payment required at booking";
    default:
      return "Advance policy varies";
  }
}

function formatCancellationPolicy(policy: {
  selfServiceCutoffHours: number;
  refundPercentBeforeCutoff: number;
}): string {
  if (policy.refundPercentBeforeCutoff >= 100) {
    return `Free cancellation up to ${policy.selfServiceCutoffHours}h before your appointment`;
  }
  return `${policy.refundPercentBeforeCutoff}% refund if cancelled at least ${policy.selfServiceCutoffHours}h before your appointment`;
}
