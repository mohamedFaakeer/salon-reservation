import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServicePackage } from "../entities/service-package.entity";
import { Payment } from "../entities/payment.entity";
import { Service } from "../entities/service.entity";
import { CustomerModule } from "../customer/customer.module";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { ServicePackageController } from "./service-package.controller";
import { ServicePackageService } from "./service-package.service";

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage, Payment, Service]), CustomerModule, AuditModule, TenantModule],
  controllers: [ServicePackageController],
  providers: [ServicePackageService],
  exports: [ServicePackageService],
})
export class ServicePackageModule {}
