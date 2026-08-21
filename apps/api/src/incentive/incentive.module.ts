import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { IncentivePlan, IncentivePlanServiceRate } from "../entities/incentive-plan.entity";
import { Payment } from "../entities/payment.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { IncentiveController } from "./incentive.controller";
import { IncentiveService } from "./incentive.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncentivePlan,
      IncentivePlanServiceRate,
      Service,
      Staff,
      Appointment,
      AppointmentServiceLine,
      Payment,
    ]),
  ],
  controllers: [IncentiveController],
  providers: [IncentiveService],
  exports: [IncentiveService],
})
export class IncentiveModule {}
