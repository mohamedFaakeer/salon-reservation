import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Staff } from "../entities/staff.entity";
import { StaffServiceAssignment } from "../entities/staff-service.entity";
import { Service } from "../entities/service.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { Closure } from "../entities/closure.entity";
import { TenantModule } from "../tenant/tenant.module";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Staff,
      StaffServiceAssignment,
      Service,
      WorkingSchedule,
      StaffLeave,
      Closure,
    ]),
    TenantModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  // Exported for reuse by P10/P12's booking flows — one engine, never forked.
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
