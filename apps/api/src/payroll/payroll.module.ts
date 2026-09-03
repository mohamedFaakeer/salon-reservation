import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Employment } from "../entities/employment.entity";
import { PayCalendar } from "../entities/pay-calendar.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { AuditModule } from "../audit/audit.module";
import { AttendanceModule } from "../attendance/attendance.module";
import { BasePayController } from "./base-pay.controller";
import { BasePayService } from "./base-pay.service";
import { EmploymentController } from "./employment.controller";
import { EmploymentService } from "./employment.service";
import { PayCalendarController } from "./pay-calendar.controller";
import { PayCalendarService } from "./pay-calendar.service";

@Module({
  imports: [TypeOrmModule.forFeature([Employment, PayCalendar, Staff, StaffLeave]), AuditModule, AttendanceModule],
  controllers: [EmploymentController, PayCalendarController, BasePayController],
  providers: [EmploymentService, PayCalendarService, BasePayService],
  exports: [EmploymentService, PayCalendarService, BasePayService],
})
export class PayrollModule {}
