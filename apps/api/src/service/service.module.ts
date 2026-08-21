import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Service } from "../entities/service.entity";
import { ServiceDiscount, ServiceDiscountWindow } from "../entities/service-discount.entity";
import { AuditModule } from "../audit/audit.module";
import { ServiceController } from "./service.controller";
import { ServiceService } from "./service.service";

@Module({
  imports: [TypeOrmModule.forFeature([Service, ServiceDiscount, ServiceDiscountWindow]), AuditModule],
  controllers: [ServiceController],
  providers: [ServiceService],
  exports: [ServiceService],
})
export class ServiceModule {}
