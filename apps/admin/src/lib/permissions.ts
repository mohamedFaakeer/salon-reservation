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
  { label: "Settings", can: canManageSettings },
  { label: "Audit", can: canViewAudit },
  { label: "Staff logins", can: canManageTeam },
];
