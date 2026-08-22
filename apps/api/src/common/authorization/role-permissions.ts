import { UserRole } from "@salon/shared";
import { Permission } from "./permission.enum";

/**
 * API.md §5 role→capability matrix, in-code (SECURITY.md §3). This map is
 * capability-only: it answers "can this role ever do X", never "does this
 * user own resource Y". Resource-ownership checks (e.g. STAFF mutating only
 * their own appointment) can't be expressed here and must be enforced in the
 * service layer once the owning resource exists — see MANAGE_OWN_APPOINTMENT
 * and the S6 deferral note in DECISIONS.md.
 */
const OWNER_MANAGER_PERMISSIONS: Permission[] = [
  Permission.MANAGE_TENANT_SETTINGS,
  Permission.MANAGE_SERVICES,
  Permission.MANAGE_STAFF,
  Permission.MANAGE_APPOINTMENTS,
  Permission.RECORD_PAYMENT,
  Permission.OVERRIDE_DISCOUNT_CAP,
  Permission.ISSUE_REFUND,
  Permission.MANAGE_CUSTOMERS,
  Permission.VIEW_DASHBOARD,
  Permission.VIEW_REPORTS,
  Permission.RECORD_ATTENDANCE,
  Permission.VIEW_ATTENDANCE,
  Permission.APPROVE_ATTENDANCE_EDIT,
  Permission.MANAGE_INCENTIVES,
  Permission.MANAGE_GIFT_CARDS,
  Permission.MANAGE_SERVICE_PACKAGES,
  Permission.VIEW_AUDIT_LOG,
  Permission.VIEW_NOTIFICATIONS,
  Permission.SEND_MARKETING_CAMPAIGN,
  Permission.MANAGE_INVENTORY,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: [Permission.PLATFORM_ADMIN],
  // Owners get everything a manager does, plus the right to hand out logins.
  [UserRole.OWNER]: [...OWNER_MANAGER_PERMISSIONS, Permission.MANAGE_TEAM],
  [UserRole.MANAGER]: OWNER_MANAGER_PERMISSIONS,
  [UserRole.RECEPTIONIST]: [
    Permission.MANAGE_APPOINTMENTS,
    Permission.RECORD_PAYMENT,
    Permission.MANAGE_CUSTOMERS,
    Permission.VIEW_DASHBOARD,
    // Punching a stylist in, but not reading anyone's attendance record.
    Permission.RECORD_ATTENDANCE,
    Permission.VIEW_NOTIFICATIONS,
  ],
  [UserRole.STAFF]: [
    Permission.MANAGE_OWN_APPOINTMENT,
    Permission.VIEW_OWN_CUSTOMER_INFO,
    Permission.VIEW_OWN_SCHEDULE,
    Permission.RECORD_OWN_ATTENDANCE,
    Permission.VIEW_OWN_INCENTIVE_EARNINGS,
  ],
};
