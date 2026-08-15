/**
 * Server-only capability set (API.md §5 permission matrix). Not shared with
 * the frontends — CLAUDE.md forbids client-side business/authorization logic;
 * the login response's `roles: string[]` is the frontends' hook for UI hints.
 */
export enum Permission {
  /** SUPER_ADMIN: provision tenants / demo-seed / list tenants. */
  PLATFORM_ADMIN = "PLATFORM_ADMIN",
  MANAGE_TENANT_SETTINGS = "MANAGE_TENANT_SETTINGS",
  MANAGE_SERVICES = "MANAGE_SERVICES",
  MANAGE_STAFF = "MANAGE_STAFF",
  MANAGE_APPOINTMENTS = "MANAGE_APPOINTMENTS",
  /** STAFF's narrower own-resource case; ownership itself is a service-layer check (P10). */
  MANAGE_OWN_APPOINTMENT = "MANAGE_OWN_APPOINTMENT",
  RECORD_PAYMENT = "RECORD_PAYMENT",
  ISSUE_REFUND = "ISSUE_REFUND",
  MANAGE_CUSTOMERS = "MANAGE_CUSTOMERS",
  VIEW_OWN_CUSTOMER_INFO = "VIEW_OWN_CUSTOMER_INFO",
  VIEW_DASHBOARD = "VIEW_DASHBOARD",
  VIEW_OWN_SCHEDULE = "VIEW_OWN_SCHEDULE",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  VIEW_NOTIFICATIONS = "VIEW_NOTIFICATIONS",
}
