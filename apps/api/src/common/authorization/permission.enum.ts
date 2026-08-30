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
  /**
   * See the team list and reset a colleague's password (which also clears
   * a lockout). Deliberately narrower than MANAGE_TEAM: OWNER and MANAGER
   * both hold this, but only OWNER can change a role or enable/disable
   * someone (account-lockout-v2, DECISIONS.md).
   */
  RESET_TEAM_MEMBER_PASSWORD = "RESET_TEAM_MEMBER_PASSWORD",
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
  /**
   * Punch anybody in or out. OWNER, MANAGER and RECEPTIONIST — the front-desk
   * path, which exists because `staff.userId` is nullable: a stylist with no
   * login of their own would otherwise be untrackable.
   */
  RECORD_ATTENDANCE = "RECORD_ATTENDANCE",
  /** Punch yourself in or out. STAFF; the "yourself" half is a service-layer check. */
  RECORD_OWN_ATTENDANCE = "RECORD_OWN_ATTENDANCE",
  /**
   * Read the attendance record: who was late, who never came. OWNER and
   * MANAGER only, and deliberately not the same as RECORD_ATTENDANCE — a
   * receptionist needs to punch people in, not to audit their colleagues.
   */
  VIEW_ATTENDANCE = "VIEW_ATTENDANCE",
  /** Decide an attendance correction. OWNER and MANAGER. */
  APPROVE_ATTENDANCE_EDIT = "APPROVE_ATTENDANCE_EDIT",
  /** Configure commission plans, assign them, and run payouts. OWNER and MANAGER only — this is payroll. */
  MANAGE_INCENTIVES = "MANAGE_INCENTIVES",
  /**
   * Issue and void gift cards. OWNER and MANAGER only. Deliberately
   * narrower than RECORD_PAYMENT: redeeming a gift card someone already
   * holds is an ordinary payment-method choice open to RECEPTIONIST too,
   * but creating new stored value is not.
   */
  MANAGE_GIFT_CARDS = "MANAGE_GIFT_CARDS",
  /**
   * Issue and void prepaid service packages. OWNER and MANAGER only, same
   * scope as MANAGE_GIFT_CARDS and for the same reason — redeeming one is an
   * ordinary payment-method choice open to RECEPTIONIST too (via
   * RECORD_PAYMENT), but creating new stored value is not.
   */
  MANAGE_SERVICE_PACKAGES = "MANAGE_SERVICE_PACKAGES",
  /** Read your own live incentive estimate and your own payout history. STAFF — not payroll access, just your own figure. */
  VIEW_OWN_INCENTIVE_EARNINGS = "VIEW_OWN_INCENTIVE_EARNINGS",
  VIEW_OWN_SCHEDULE = "VIEW_OWN_SCHEDULE",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  VIEW_NOTIFICATIONS = "VIEW_NOTIFICATIONS",
  /**
   * Manage notification rules, templates, scheduling, and send test notifications.
   * OWNER and MANAGER only — same scope as VIEW_REPORTS.
   */
  MANAGE_NOTIFICATIONS = "MANAGE_NOTIFICATIONS",
  /**
   * Manage notification rules (create, update, delete, list).
   * OWNER and MANAGER only.
   */
  MANAGE_NOTIFICATION_RULES = "MANAGE_NOTIFICATION_RULES",
  /**
   * Manage notification templates (create, update, delete, list).
   * OWNER and MANAGER only.
   */
  MANAGE_NOTIFICATION_TEMPLATES = "MANAGE_NOTIFICATION_TEMPLATES",
  /**
   * Send a win-back message to lapsed customers. OWNER and MANAGER only,
   * same scope as VIEW_REPORTS — the audience this reaches into (named
   * customers, their contact details) is the same owner-level surface.
   */
  SEND_MARKETING_CAMPAIGN = "SEND_MARKETING_CAMPAIGN",
  /**
   * View customer information (for preferences management).
   * RECEPTIONIST and above.
   */
  VIEW_CUSTOMERS = "VIEW_CUSTOMERS",
  /**
   * The retail "back office": products, variants, stock receipts and manual
   * adjustments. OWNER and MANAGER only — mirrors how MANAGE_GIFT_CARDS
   * covers both issue and void rather than one permission per CRUD verb.
   * Deliberately does NOT gate ringing up a sale: checking out a cart is an
   * ordinary payment-taking action open to RECEPTIONIST via RECORD_PAYMENT,
   * the same split gift cards and service packages already use.
   */
  MANAGE_INVENTORY = "MANAGE_INVENTORY",
}
