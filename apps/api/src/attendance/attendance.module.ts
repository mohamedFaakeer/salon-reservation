import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { AttendanceEditRequest } from "../entities/attendance-edit-request.entity";
import { Closure } from "../entities/closure.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { TenantModule } from "../tenant/tenant.module";
import { AuditModule } from "../audit/audit.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { AttendanceEditController } from "./attendance-edit.controller";
import { AttendanceEditService } from "./attendance-edit.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceDay, AttendanceEditRequest, Staff, WorkingSchedule, StaffLeave, Closure]),
    TenantModule,
    AuditModule,
  ],
  controllers: [AttendanceController, AttendanceEditController],
  providers: [AttendanceService, AttendanceEditService],
  exports: [AttendanceService, AttendanceEditService],
})
export class AttendanceModule {}
