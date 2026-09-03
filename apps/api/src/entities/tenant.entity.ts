import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { DEFAULT_TENANT_ENTITLEMENTS, DEFAULT_TENANT_SETTINGS, type TenantEntitlements, type TenantSettings } from "@salon/shared";
import type { TenantStatus } from "../enums/tenant-status.enum";

/**
 * `tenant.settings` is a jsonb blob with no migration ever backfilling it, so
 * a tenant provisioned before a settings field existed has a stored blob that
 * simply lacks that key — not `null`, absent. Read as plain JS, an absent
 * numeric field is `undefined`, and `undefined` participates in arithmetic
 * and comparisons in ways that fail *silently*: `someShare > undefined` is
 * always `false`, so `discountCapPercent`'s authorization check never
 * triggered for any tenant older than the phase that added it, and
 * `someMinutes - undefined` is `NaN`, which Postgres then refuses outright
 * the next time it is written to an integer column.
 *
 * Merging the shipped defaults under whatever is actually stored, on every
 * read, closes that gap at its one true source rather than trusting every
 * future call site to remember `?? DEFAULT`. `cancellationPolicy` gets the
 * same treatment one level down for the same reason.
 */
export function withDefaults(raw: Partial<TenantSettings> | null | undefined): TenantSettings {
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...raw,
    cancellationPolicy: {
      ...DEFAULT_TENANT_SETTINGS.cancellationPolicy,
      ...raw?.cancellationPolicy,
    },
  };
}

/**
 * Same defensive shape as `withDefaults` above, and for the same class of
 * reason: a tenant row written before a new override bucket existed has a
 * stored blob that simply lacks that key. Unlike `settings`, the buckets here
 * default to *empty* (`{}`), not to a filled-in value — `resolveModules` /
 * `resolveReportPanels` / `resolveLimits` are what apply the tier's own
 * defaults on top, at read time, everywhere this is consumed. Filling them in
 * here too would mean two places deciding what "no override" means.
 */
export function withEntitlementsDefaults(
  raw: Partial<TenantEntitlements> | null | undefined,
): TenantEntitlements {
  return {
    tier: raw?.tier ?? DEFAULT_TENANT_ENTITLEMENTS.tier,
    moduleOverrides: raw?.moduleOverrides ?? {},
    reportPanelOverrides: raw?.reportPanelOverrides ?? {},
    limitOverrides: raw?.limitOverrides ?? {},
  };
}

@Entity("tenant")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 63 })
  slug!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: TenantStatus;

  /**
   * Independent of `status` on purpose: `status` already gates staff/admin
   * login live on every request (TenantGuard) — reusing it here would take
   * staff access down along with customer visibility, a different decision a
   * platform admin didn't ask to make. This only affects whether customers
   * can discover/book the salon (`SalonService.list`, `TenantService.findActiveBySlug`).
   */
  @Column({ type: "boolean", default: true })
  customerBookingEnabled!: boolean;

  /**
   * Whether Payroll's EPF/ETF/APIT statutory engine may compute real
   * figures for this tenant, as opposed to leaving them as manual entry.
   * Defaults `false` for every tenant, including PRO — this isn't a
   * plan-tier feature gate like `payroll`/`incentives` in
   * `tenant-entitlements.ts`, it's a compliance gate: the engine exists and
   * is fully testable once Payroll is enabled, but produces figures nobody
   * has authority to assert are legally correct until a qualified Sri
   * Lankan payroll/accounting professional has reviewed this tenant's
   * configuration (DECISIONS.md §62/§65). Only a platform admin can turn it
   * on (`PATCH /super-admin/tenants/:id/statutory-payroll`), the same
   * SUPER_ADMIN-only shape `customerBookingEnabled` above already uses —
   * never a self-service owner toggle.
   */
  @Column({ type: "boolean", default: false })
  statutoryPayrollEnabled!: boolean;

  @Column({ type: "varchar", length: 3, default: "LKR" })
  currency!: string;

  @Column({ type: "varchar", length: 63, default: "Asia/Colombo" })
  timezone!: string;

  @Column({
    type: "jsonb",
    default: () => "'{}'",
    transformer: { to: (value: TenantSettings) => value, from: withDefaults },
  })
  settings!: TenantSettings;

  /**
   * Lite/Pro tier plus per-module, per-report-panel and numeric-limit
   * overrides. SUPER_ADMIN-only to write (`super-admin/entitlements.*`) —
   * deliberately a separate column from `settings`, which the tenant's own
   * OWNER/MANAGER can PATCH themselves.
   */
  @Column({
    type: "jsonb",
    default: () => "'{}'",
    transformer: { to: (value: TenantEntitlements) => value, from: withEntitlementsDefaults },
  })
  entitlements!: TenantEntitlements;

  /**
   * Offboarding lifecycle (DECISIONS.md — salon offboarding). Set together
   * with `status = SUSPENDED` and `customerBookingEnabled = false` by
   * `TenantOffboardingService.deactivate()`; null means "never deactivated,
   * or reactivated since". Distinct from `status` alone because a future,
   * unrelated "suspend for non-payment" feature could reuse `SUSPENDED`
   * without implying an offboarding clock is running.
   */
  @Column({ type: "timestamptz", nullable: true })
  deletionRequestedAt!: Date | null;

  /**
   * Set once the anonymization purge has actually run — manually or by the
   * scheduled sweep, 90 days after `deletionRequestedAt`. Null forever if a
   * deactivated tenant is reactivated before that point. Once set, the
   * tenant can no longer be reactivated: its PII is already scrubbed.
   */
  @Column({ type: "timestamptz", nullable: true })
  purgedAt!: Date | null;

  /** Free-text, admin-entered context for why this salon was deactivated — audit trail only, never validated. */
  @Column({ type: "text", nullable: true })
  deactivationReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}