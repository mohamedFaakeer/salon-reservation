import { Module } from "@nestjs/common";
import { PlatformAlertService } from "./platform-alert.service";

/**
 * Deliberately a leaf module — no imports of its own. `AuditModule` (for
 * HIGH/CRITICAL security events) and `NotificationModule` (for the
 * quota-threshold alert) both import this; this must never import either of
 * them back, or that becomes a circular module dependency.
 */
@Module({
  providers: [PlatformAlertService],
  exports: [PlatformAlertService],
})
export class PlatformAlertModule {}
