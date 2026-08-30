export enum UserStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  /**
   * Hard-locked after too many wrong passwords in a row — unlike `DISABLED`
   * (a deliberate owner/manager decision), this state is entered
   * automatically by `AuthService.login()` and can only be cleared by an
   * OWNER/MANAGER/SUPER_ADMIN password reset, never by time or a retry.
   */
  LOCKED = "LOCKED",
}