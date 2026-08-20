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
