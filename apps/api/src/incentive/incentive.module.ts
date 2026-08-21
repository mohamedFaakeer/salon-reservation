import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { IncentivePayout } from "../entities/incentive-payout.entity";
import { IncentivePlan, IncentivePlanServiceRate } from "../entities/incentive-plan.entity";
import { Payment } from "../entities/payment.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { AuditModule } from "../audit/audit.module";
import { IncentiveController } from "./incentive.controller";
import { IncentiveService } from "./incentive.service";
import { IncentivePayoutController } from "./incentive-payout.controller";
import { IncentivePayoutService } from "./incentive-payout.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncentivePlan,
      IncentivePlanServiceRate,
      IncentivePayout,
      Service,
      Staff,
      Appointment,
      AppointmentServiceLine,
      Payment,
    ]),
    AuditModule,
  ],
  controllers: [IncentiveController, IncentivePayoutController],
  providers: [IncentiveService, IncentivePayoutService],
  exports: [IncentiveService, IncentivePayoutService],
})
export class IncentiveModule {}
