import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { Staff } from "../entities/staff.entity";
import { AuditModule } from "../audit/audit.module";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";

@Module({
  imports: [TypeOrmModule.forFeature([WorkingSchedule, Staff]), AuditModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
