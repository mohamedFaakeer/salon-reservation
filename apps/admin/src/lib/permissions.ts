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
