import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { ErrorLog } from "../entities/error-log.entity";
import { Notification } from "../entities/notification.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";
import { Payment } from "../entities/payment.entity";
import { SecurityEventReview } from "../entities/security-event-review.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { AuditModule } from "../audit/audit.module";
import { PlatformAlertModule } from "../alerting/platform-alert.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";
import { SystemHealthMonitorService } from "./system-health-monitor.service";

/**
 * Registers the two tables the super-admin monitoring feature owns
 * (`ErrorLog`, `SecurityEventReview`) — reachable both from
 * `MonitoringController`/`MonitoringService` here and, for `ErrorLog`
 * specifically, from `main.ts` via `app.get(getRepositoryToken(ErrorLog))`:
 * `ApiExceptionFilter` needs one but is instantiated outside Nest's DI
 * container (see `main.ts`).
 *
 * `PlatformAlertModule` is imported for `SystemHealthMonitorService`'s
 * database-outage alert — a real dependency-outage alert alongside the
 * dashboard's passive `ErrorLog`/`SecurityEventReview` views.
 *
 * `Notification` and `CloudinaryModule` back `MonitoringService.serviceStatus()`
 * (the "Service status" tab) — reading real, already-written delivery-failure
 * history and Cloudinary's configured-or-not state rather than making any new
 * outbound call to a third party.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ErrorLog,
      SecurityEventReview,
      Tenant,
      Appointment,
      Payment,
      User,
      NotificationQuota,
      Notification,
    ]),
    AuditModule,
    PlatformAlertModule,
    CloudinaryModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService, SystemHealthMonitorService],
})
export class MonitoringModule {}
