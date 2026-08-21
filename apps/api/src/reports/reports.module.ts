import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { Closure } from "../entities/closure.entity";
import { Customer } from "../entities/customer.entity";
import { Inquiry } from "../entities/inquiry.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { Refund } from "../entities/refund.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { TenantModule } from "../tenant/tenant.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/**
 * Read-only across most of the schema. It owns no tables and mutates nothing —
 * every repository here is registered purely to aggregate.
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
      Payment,
      Rating,
      Refund,
      Staff,
      StaffLeave,
      WorkingSchedule,
    ]),
    TenantModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
