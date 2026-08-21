import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { Closure } from "../entities/closure.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { TenantModule } from "../tenant/tenant.module";
import { AuditModule } from "../audit/audit.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceDay, Staff, WorkingSchedule, StaffLeave, Closure]),
    TenantModule,
    AuditModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
