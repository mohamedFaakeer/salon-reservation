import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Staff } from "../entities/staff.entity";
import { AuditModule } from "../audit/audit.module";
import { StaffLeaveController } from "./staff-leave.controller";
import { StaffLeaveService } from "./staff-leave.service";

@Module({
  imports: [TypeOrmModule.forFeature([StaffLeave, Staff]), AuditModule],
  controllers: [StaffLeaveController],
  providers: [StaffLeaveService],
  exports: [StaffLeaveService],
})
export class StaffLeaveModule {}
