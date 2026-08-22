import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { Closure } from "../entities/closure.entity";
import { Customer } from "../entities/customer.entity";
import { Inquiry } from "../entities/inquiry.entity";
import { Notification } from "../entities/notification.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { Refund } from "../entities/refund.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { TenantModule } from "../tenant/tenant.module";
import { NotificationModule } from "../notification/notification.module";
import { AuditModule } from "../audit/audit.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { WinbackController } from "./winback.controller";
import { WinbackService } from "./winback.service";

/**
 * Read-only across most of the schema, except the one write `WinbackService`
 * performs (a `Notification` row per message sent) — everything
 * `ReportsService` itself touches stays purely an aggregate.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentServiceLine,
      AttendanceDay,
      Closure,
      Customer,
      Inquiry,
      Notification,
      Payment,
      Rating,
      Refund,
      Staff,
      StaffLeave,
      WorkingSchedule,
    ]),
    TenantModule,
    NotificationModule,
    AuditModule,
  ],
  controllers: [ReportsController, WinbackController],
  providers: [ReportsService, WinbackService],
})
export class ReportsModule {}
