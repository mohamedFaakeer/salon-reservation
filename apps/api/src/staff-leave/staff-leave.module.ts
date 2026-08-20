import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Staff } from "../entities/staff.entity";
import { Appointment } from "../entities/appointment.entity";
import { AuditModule } from "../audit/audit.module";
import { LeaveController, StaffLeaveController } from "./staff-leave.controller";
import { StaffLeaveService } from "./staff-leave.service";

@Module({
  imports: [TypeOrmModule.forFeature([StaffLeave, Staff, Appointment]), AuditModule],
  controllers: [StaffLeaveController, LeaveController],
  providers: [StaffLeaveService],
  exports: [StaffLeaveService],
})
export class StaffLeaveModule {}
