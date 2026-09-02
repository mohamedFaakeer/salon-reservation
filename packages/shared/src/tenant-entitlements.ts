/**
 * What a tenant is actually entitled to use — the Lite/Pro split, and
 * everything a super-admin can configure per salon on top of it.
 *
 * Three independent axes, because they behave differently and get enforced at
 * different points:
 *   - `moduleOverrides` / `reportPanelOverrides` — whole features, on or off.
 *   - `limitOverrides` — numeric ceilings, some hard (seats), some soft with a
 *     small grace buffer (daily bookings), some just capping a setting the
 *     tenant already edits themselves (booking window, reminders, discount cap).
 *
 * A tier (`LITE`/`PRO`) sets the default bundle for all three; an override is
 * an explicit per-tenant exception layered on top, exactly the way a stylist's
 * incentive plan overrides a rate for one named service rather than replacing
 * the whole plan. `resolve*` are the one place that merge — every caller
 * (guards, the reports service, the platform drawer) goes through them rather
 * than re-implementing "tier default unless overridden".
 */

export type PlanTier = "LITE" | "PRO";

export interface ModuleOverrides {
  attendance?: boolean;
  incentives?: boolean;
  /** The Reports page itself. Individual panels are `reportPanelOverrides`. */
  reports?: boolean;
  auditLog?: boolean;
  invoices?: boolean;
  /**
   * Retail product sales — Products/Stock/Quick Sale in apps/admin. Unlike
   * gift cards and service packages (deliberately never gated: every salon
   * can sell either), most salons on this platform are service-only, so
   * inventory is genuinely opt-in rather than a Lite-vs-Pro feature split.
   */
  inventory?: boolean;
  /**
   * Notification rules, templates, scheduling, multi-channel delivery,
   * customer preferences, and quota management.
   */
  notifications?: boolean;
  /**
   * Employment/payroll profiles, pay calendars, and (in later phases) payroll
   * runs and payslips. Gated the same way `incentives` is — a new, legally
   * sensitive module a Lite tenant shouldn't get by default (DECISIONS.md §62).
   */
  payroll?: boolean;
}

export type ModuleKey = keyof ModuleOverrides;
export const ALL_MODULES: ModuleKey[] = [
  "attendance",
  "incentives",
  "reports",
  "auditLog",
  "invoices",
  "inventory",
  "notifications",
  "payroll",
];

/** The seven panels the Reports page is actually built from — see reports.service.ts. */
export interface ReportPanelOverrides {
  takings?: boolean;
  staff?: boolean;
  services?: boolean;
  busyHours?: boolean;
  lapsedCustomers?: boolean;
  customerSpend?: boolean;
  funnelLosses?: boolean;
  /** Revenue/cost/margin on retail product sales — meaningless without the `inventory` module, but gated the same tier-default way as every other panel. */
  productSales?: boolean;
}

export type ReportPanelKey = keyof ReportPanelOverrides;
export const ALL_REPORT_PANELS: ReportPanelKey[] = [
  "takings",
  "staff",
  "services",
  "busyHours",
  "lapsedCustomers",
  "customerSpend",
  "funnelLosses",
  "productSales",
];

export interface TenantLimits {
  /** Hard caps — refused outright once reached. Login/profile creation, not organic volume. */
  maxManagers?: number | null;
  maxReceptionists?: number | null;
  /** Bookable stylist profiles (`Staff`), not logins — a stylist may have no login at all. */
  maxStaff?: number | null;
  maxServices?: number | null;
  maxIncentivePlans?: number | null;
  /**
   * Soft — organic daily volume, not a deliberate action. A tenant may run up
   * to `BOOKING_LIMIT_GRACE` over this before a booking is actually refused;
   * crossing the limit itself only raises a flag on the platform tenant list.
   * `null` = unlimited.
   */
  maxBookingsPerDay?: number | null;
  /** Ceilings on settings the tenant already edits themselves (`TenantSettings`). */
  maxBookingWindowDays?: number | null;
  maxReminderOffsets?: number | null;
  maxDiscountCapPercent?: number | null;
}

export type LimitKey = keyof TenantLimits;

export interface TenantEntitlements {
  tier: PlanTier;
  moduleOverrides: ModuleOverrides;
  reportPanelOverrides: ReportPanelOverrides;
  limitOverrides: TenantLimits;
}

/** Every existing tenant gets this on ship day — nothing anyone currently uses disappears. */
export const DEFAULT_TENANT_ENTITLEMENTS: TenantEntitlements = {
  tier: "PRO",
  moduleOverrides: {},
  reportPanelOverrides: {},
  limitOverrides: {},
};

/** A booking at limit+1 or limit+2 is let through but flagged; limit+3 is refused. */
export const BOOKING_LIMIT_GRACE = 2;

const PRO_MODULES: Required<ModuleOverrides> = {
  attendance: true,
  incentives: true,
  reports: true,
  auditLog: true,
  invoices: true,
  inventory: true,
  notifications: true,
  payroll: true,
};

const LITE_MODULES: Required<ModuleOverrides> = {
  attendance: false,
  incentives: false,
  reports: false,
  auditLog: false,
  invoices: false,
  inventory: false,
  notifications: false,
  payroll: false,
};

const PRO_REPORT_PANELS: Required<ReportPanelOverrides> = {
  takings: true,
  staff: true,
  services: true,
  busyHours: true,
  lapsedCustomers: true,
  customerSpend: true,
  funnelLosses: true,
  productSales: true,
};

const LITE_REPORT_PANELS: Required<ReportPanelOverrides> = {
  takings: false,
  staff: false,
  services: false,
  busyHours: false,
  lapsedCustomers: false,
  customerSpend: false,
  funnelLosses: false,
  productSales: false,
};

/** `null` means unlimited throughout. */
const PRO_LIMITS: Required<TenantLimits> = {
  maxManagers: null,
  maxReceptionists: null,
  maxStaff: null,
  maxServices: null,
  maxIncentivePlans: null,
  maxBookingsPerDay: null,
  maxBookingWindowDays: null,
  maxReminderOffsets: null,
  maxDiscountCapPercent: null,
};

const LITE_LIMITS: Required<TenantLimits> = {
  maxManagers: 0,
  maxReceptionists: 1,
  maxStaff: 5,
  maxServices: 20,
  maxIncentivePlans: 0,
  maxBookingsPerDay: 20,
  maxBookingWindowDays: 14,
  maxReminderOffsets: 1,
  maxDiscountCapPercent: 10,
};

export function resolveModules(entitlements: TenantEntitlements): Record<ModuleKey, boolean> {
  const base = entitlements.tier === "PRO" ? PRO_MODULES : LITE_MODULES;
  return { ...base, ...entitlements.moduleOverrides };
}

export function resolveReportPanels(entitlements: TenantEntitlements): Record<ReportPanelKey, boolean> {
  const base = entitlements.tier === "PRO" ? PRO_REPORT_PANELS : LITE_REPORT_PANELS;
  return { ...base, ...entitlements.reportPanelOverrides };
}

export function resolveLimits(entitlements: TenantEntitlements): Required<TenantLimits> {
  const base = entitlements.tier === "PRO" ? PRO_LIMITS : LITE_LIMITS;
  return { ...base, ...entitlements.limitOverrides };
}
