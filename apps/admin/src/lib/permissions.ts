/**
 * Client-side mirror of `apps/api/src/common/authorization/role-permissions.ts`,
 * used ONLY for conditional rendering (hide buttons a role can't use) — never
 * imported from the API, which is explicitly server-only. The server
 * independently re-checks every mutation via RolesGuard regardless
 * (UX.md: "frontend hiding = convenience").
 */
export function canManageAppointments(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

export function canActOnOwnAppointment(roles: string[]): boolean {
  return roles.includes("STAFF");
}

/** Mirrors RECORD_PAYMENT (OWNER, MANAGER, RECEPTIONIST). */
export function canRecordPayment(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

/** Mirrors ISSUE_REFUND (OWNER, MANAGER only). */
export function canIssueRefund(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors VIEW_NOTIFICATIONS (OWNER, MANAGER, RECEPTIONIST). */
export function canManageNotifications(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

/** Mirrors MANAGE_SERVICES (OWNER, MANAGER only). */
export function canManageServices(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_STAFF (OWNER, MANAGER only) — covers staff, skills, rotas, leave, closures. */
export function canManageStaff(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_TENANT_SETTINGS (OWNER, MANAGER only). */
export function canManageSettings(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_CUSTOMERS (OWNER, MANAGER, RECEPTIONIST). */
export function canManageCustomers(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

/** Mirrors VIEW_AUDIT_LOG (OWNER, MANAGER only). */
export function canViewAudit(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors VIEW_DASHBOARD (OWNER, MANAGER, RECEPTIONIST) — STAFF has no day board. */
export function canViewDashboard(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

/**
 * Mirrors VIEW_REPORTS (OWNER, MANAGER). Deliberately narrower than
 * canViewDashboard: reports carry salon revenue, a per-stylist league table
 * and named customer spend, which a receptionist working the desk has no
 * business seeing by default.
 */
export function canViewReports(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/**
 * SUPER_ADMIN holds PLATFORM_ADMIN and nothing else — it cannot read a single
 * tenant route. It is therefore not "an admin with more rights" but a
 * different application, which is why it gets its own shell rather than a
 * hidden section of the salon sidebar.
 */
export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes("SUPER_ADMIN");
}

/** Mirrors MANAGE_TEAM (OWNER only) — creating logins hands out privilege. */
export function canManageTeam(roles: string[]): boolean {
  return roles.includes("OWNER");
}

/** Mirrors RECORD_ATTENDANCE (OWNER, MANAGER, RECEPTIONIST) — the front-desk punch. */
export function canRecordAttendance(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER" || r === "RECEPTIONIST");
}

/** Mirrors VIEW_ATTENDANCE (OWNER, MANAGER only). */
export function canViewAttendance(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors APPROVE_ATTENDANCE_EDIT (OWNER, MANAGER only). */
export function canApproveAttendanceEdit(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_INCENTIVES (OWNER, MANAGER only) — commission plans and payouts are payroll. */
export function canManageIncentives(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_GIFT_CARDS (OWNER, MANAGER only) — issuing and voiding, not redeeming. */
export function canManageGiftCards(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_SERVICE_PACKAGES (OWNER, MANAGER only) — issuing and voiding, not redeeming. */
export function canManageServicePackages(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors SEND_MARKETING_CAMPAIGN (OWNER, MANAGER only) — same scope as VIEW_REPORTS, which this reads from. */
export function canSendMarketingCampaign(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/** Mirrors MANAGE_INVENTORY (OWNER, MANAGER only) — the retail back office: products, stock, receipts, adjustments. Ringing up a sale is `canRecordPayment` instead. */
export function canManageInventory(roles: string[]): boolean {
  return roles.some((r) => r === "OWNER" || r === "MANAGER");
}

/**
 * STAFF holding only that one role — a stylist with no elevated grant at this
 * salon. Used to route a login toward the floor kiosk instead of the desk
 * shell: someone who is STAFF *and* something else (rare, but the data model
 * allows one user one role per tenant, so this is really "is STAFF the only
 * role") still belongs at the desk.
 */
export function isStaffOnly(roles: string[]): boolean {
  return roles.includes("STAFF") && !roles.some((r) => r !== "STAFF");
}

/**
 * What each assignable role can reach, derived from the same predicates the
 * sidebar uses rather than a hand-written table. A table would drift the first
 * time the permission matrix changed, and this screen exists precisely to tell
 * an owner the truth about what they are granting.
 */
export const MODULES: Array<{ label: string; can: (roles: string[]) => boolean }> = [
  { label: "Today & schedule", can: canViewDashboard },
  { label: "Appointments", can: canManageAppointments },
  { label: "Customers", can: canManageCustomers },
  { label: "Payments", can: canRecordPayment },
  { label: "Refunds", can: canIssueRefund },
  { label: "Services", can: canManageServices },
  { label: "Staff & availability", can: canManageStaff },
  { label: "Incentives", can: canManageIncentives },
  { label: "Gift cards", can: canManageGiftCards },
  { label: "Service packages", can: canManageServicePackages },
  { label: "Retail inventory", can: canManageInventory },
  { label: "Settings", can: canManageSettings },
  { label: "Reports", can: canViewReports },
  { label: "Audit", can: canViewAudit },
  { label: "Staff logins", can: canManageTeam },
];
