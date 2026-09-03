import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Employment } from "../entities/employment.entity";
import { IncentivePayout } from "../entities/incentive-payout.entity";
import { PayCalendar } from "../entities/pay-calendar.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { AuditModule } from "../audit/audit.module";
import { AttendanceModule } from "../attendance/attendance.module";
import { IncentiveModule } from "../incentive/incentive.module";
import { BasePayController } from "./base-pay.controller";
import { BasePayService } from "./base-pay.service";
import { EmploymentController } from "./employment.controller";
import { EmploymentService } from "./employment.service";
import { PayCalendarController } from "./pay-calendar.controller";
import { PayCalendarService } from "./pay-calendar.service";
import { PayrollPreviewController } from "./payroll-preview.controller";
import { PayrollPreviewService } from "./payroll-preview.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Employment, PayCalendar, Staff, StaffLeave, IncentivePayout]),
    AuditModule,
    AttendanceModule,
    IncentiveModule,
  ],
  controllers: [EmploymentController, PayCalendarController, BasePayController, PayrollPreviewController],
  providers: [EmploymentService, PayCalendarService, BasePayService, PayrollPreviewService],
  exports: [EmploymentService, PayCalendarService, BasePayService, PayrollPreviewService],
})
export class PayrollModule {}
