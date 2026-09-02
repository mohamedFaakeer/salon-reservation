import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Employment } from "../entities/employment.entity";
import { PayCalendar } from "../entities/pay-calendar.entity";
import { Staff } from "../entities/staff.entity";
import { AuditModule } from "../audit/audit.module";
import { EmploymentController } from "./employment.controller";
import { EmploymentService } from "./employment.service";
import { PayCalendarController } from "./pay-calendar.controller";
import { PayCalendarService } from "./pay-calendar.service";

@Module({
  imports: [TypeOrmModule.forFeature([Employment, PayCalendar, Staff]), AuditModule],
  controllers: [EmploymentController, PayCalendarController],
  providers: [EmploymentService, PayCalendarService],
  exports: [EmploymentService, PayCalendarService],
})
export class PayrollModule {}
