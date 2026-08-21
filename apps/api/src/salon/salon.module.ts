import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Tenant } from "../entities/tenant.entity";
import { Branch } from "../entities/branch.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { Closure } from "../entities/closure.entity";
import { TenantModule } from "../tenant/tenant.module";
import { PricingModule } from "../pricing/pricing.module";
import { SalonController } from "./salon.controller";
import { SalonService } from "./salon.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Branch, Service, Staff, WorkingSchedule, Closure]),
    TenantModule,
    PricingModule,
  ],
  controllers: [SalonController],
  providers: [SalonService],
})
export class SalonModule {}
