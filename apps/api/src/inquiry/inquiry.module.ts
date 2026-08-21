import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Inquiry, InquiryService as InquiryServiceLine } from "../entities/inquiry.entity";
import { Appointment } from "../entities/appointment.entity";
import { Service } from "../entities/service.entity";
import { TenantModule } from "../tenant/tenant.module";
import { CustomerModule } from "../customer/customer.module";
import { AuditModule } from "../audit/audit.module";
import { InquiryController } from "./inquiry.controller";
import { InquiryService } from "./inquiry.service";

@Module({
  imports: [
    // InquiryServiceLine stays registered here so autoLoadEntities picks up the
    // entity; the service reaches it through the transaction manager, not DI.
    TypeOrmModule.forFeature([Inquiry, InquiryServiceLine, Appointment, Service]),
    TenantModule,
    CustomerModule,
    AuditModule,
  ],
  controllers: [InquiryController],
  providers: [InquiryService],
  exports: [InquiryService],
})
export class InquiryModule {}
