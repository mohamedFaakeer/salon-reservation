import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { ErrorLog } from "../entities/error-log.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";
import { Payment } from "../entities/payment.entity";
import { SecurityEventReview } from "../entities/security-event-review.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { AuditModule } from "../audit/audit.module";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

/**
 * Registers the two tables the super-admin monitoring feature owns
 * (`ErrorLog`, `SecurityEventReview`) — reachable both from
 * `MonitoringController`/`MonitoringService` here and, for `ErrorLog`
 * specifically, from `main.ts` via `app.get(getRepositoryToken(ErrorLog))`:
 * `ApiExceptionFilter` needs one but is instantiated outside Nest's DI
 * container (see `main.ts`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ErrorLog, SecurityEventReview, Tenant, Appointment, Payment, User, NotificationQuota]),
    AuditModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
