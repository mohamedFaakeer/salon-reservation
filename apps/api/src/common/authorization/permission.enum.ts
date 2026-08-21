/**
 * Server-only capability set (API.md §5 permission matrix). Not shared with
 * the frontends — CLAUDE.md forbids client-side business/authorization logic;
 * the login response's `roles: string[]` is the frontends' hook for UI hints.
 */
export enum Permission {
  /** SUPER_ADMIN: provision tenants / demo-seed / list tenants. */
  PLATFORM_ADMIN = "PLATFORM_ADMIN",
  MANAGE_TENANT_SETTINGS = "MANAGE_TENANT_SETTINGS",
  /** Create and suspend staff logins. OWNER only — this grants privilege. */
  MANAGE_TEAM = "MANAGE_TEAM",
  MANAGE_SERVICES = "MANAGE_SERVICES",
  MANAGE_STAFF = "MANAGE_STAFF",
  MANAGE_APPOINTMENTS = "MANAGE_APPOINTMENTS",
  /** STAFF's narrower own-resource case; ownership itself is a service-layer check (P10). */
  MANAGE_OWN_APPOINTMENT = "MANAGE_OWN_APPOINTMENT",
  RECORD_PAYMENT = "RECORD_PAYMENT",
  /**
   * Discount a bill by more than the tenant's own cap. OWNER and MANAGER
   * only: anyone who can take payment may make the everyday goodwill gesture,
   * but waiving a bill is an owner's call, not a busy desk's.
   */
  OVERRIDE_DISCOUNT_CAP = "OVERRIDE_DISCOUNT_CAP",
  ISSUE_REFUND = "ISSUE_REFUND",
  MANAGE_CUSTOMERS = "MANAGE_CUSTOMERS",
  VIEW_OWN_CUSTOMER_INFO = "VIEW_OWN_CUSTOMER_INFO",
  VIEW_DASHBOARD = "VIEW_DASHBOARD",
  /**
   * The reports module. OWNER and MANAGER only — deliberately NOT the same as
   * VIEW_DASHBOARD, which receptionists hold. Reports expose salon revenue,
   * a per-stylist league table and named customer spend; who sees that is the
   * owner's decision to make, not a side effect of working the desk.
   */
  VIEW_REPORTS = "VIEW_REPORTS",
  VIEW_OWN_SCHEDULE = "VIEW_OWN_SCHEDULE",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  VIEW_NOTIFICATIONS = "VIEW_NOTIFICATIONS",
}
