import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmployeePayComponent } from "../entities/employee-pay-component.entity";
import { Employment } from "../entities/employment.entity";
import { IncentivePayout } from "../entities/incentive-payout.entity";
import { PayCalendar } from "../entities/pay-calendar.entity";
import { PayrollRun } from "../entities/payroll-run.entity";
import { StatutoryRuleSet } from "../entities/statutory-rule-set.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Tenant } from "../entities/tenant.entity";
import { AuditModule } from "../audit/audit.module";
import { AttendanceModule } from "../attendance/attendance.module";
import { IncentiveModule } from "../incentive/incentive.module";
import { BasePayController } from "./base-pay.controller";
import { BasePayService } from "./base-pay.service";
import { EmploymentController } from "./employment.controller";
import { EmploymentService } from "./employment.service";
import { PayCalendarController } from "./pay-calendar.controller";
import { PayCalendarService } from "./pay-calendar.service";
import { PayComponentController } from "./pay-component.controller";
import { PayComponentService } from "./pay-component.service";
import { PayrollPreviewController } from "./payroll-preview.controller";
import { PayrollPreviewService } from "./payroll-preview.service";
import { PayrollRunController } from "./payroll-run.controller";
import { PayrollRunService } from "./payroll-run.service";
import { PayrollSettingsController } from "./payroll-settings.controller";
import { PayrollSettingsService } from "./payroll-settings.service";
import { StatutoryPreviewController } from "./statutory-preview.controller";
import { StatutoryPreviewService } from "./statutory-preview.service";
import { StatutoryRuleSetController } from "./statutory-rule-set.controller";
import { StatutoryRuleSetService } from "./statutory-rule-set.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employment,
      PayCalendar,
      Staff,
      StaffLeave,
      IncentivePayout,
      StatutoryRuleSet,
      Tenant,
      PayrollRun,
      EmployeePayComponent,
    ]),
    AuditModule,
    AttendanceModule,
    IncentiveModule,
  ],
  controllers: [
    EmploymentController,
    PayCalendarController,
    PayComponentController,
    BasePayController,
    PayrollPreviewController,
    StatutoryRuleSetController,
    StatutoryPreviewController,
    PayrollRunController,
    PayrollSettingsController,
  ],
  providers: [
    EmploymentService,
    PayCalendarService,
    PayComponentService,
    BasePayService,
    PayrollPreviewService,
    StatutoryRuleSetService,
    StatutoryPreviewService,
    PayrollRunService,
    PayrollSettingsService,
  ],
  exports: [
    EmploymentService,
    PayCalendarService,
    PayComponentService,
    BasePayService,
    PayrollPreviewService,
    StatutoryRuleSetService,
    PayrollRunService,
  ],
})
export class PayrollModule {}
