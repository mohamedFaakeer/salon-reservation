import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Invoice } from "../entities/invoice.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Branch } from "../entities/branch.entity";
import { Payment } from "../entities/payment.entity";
import { Staff } from "../entities/staff.entity";
import { Tenant } from "../entities/tenant.entity";
import { TenantModule } from "../tenant/tenant.module";
import { AuditModule } from "../audit/audit.module";
import { InvoiceController } from "./invoice.controller";
import { InvoiceService } from "./invoice.service";
import { InvoiceMailer } from "./invoice-mailer";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      Appointment,
      AppointmentServiceLine,
      Branch,
      Payment,
      Staff,
      Tenant,
    ]),
    TenantModule,
    AuditModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceMailer],
  exports: [InvoiceService],
})
export class InvoiceModule {}
