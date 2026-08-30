import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Customer } from "../entities/customer.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { Tag } from "../entities/tag.entity";
import { CustomerTag } from "../entities/customer-tag.entity";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { CustomerController } from "./customer.controller";
import { CustomerUnsubscribeController } from "./customer-unsubscribe.controller";
import { CustomerService } from "./customer.service";
import { TagController } from "./tag.controller";
import { TagService } from "./tag.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Appointment, AppointmentServiceLine, Payment, Rating, Tag, CustomerTag]),
    AuditModule, // CustomerService audits a phone-number change (account-lockout-v2's audit-action shape).
    TenantModule, // CustomerService reads customerSegmentSettings/customTitleOptions via TenantService.getSettings.
    CloudinaryModule, // CustomerService.uploadPhoto/removePhoto.
  ],
  controllers: [CustomerController, CustomerUnsubscribeController, TagController],
  providers: [CustomerService, TagService],
  exports: [CustomerService],
})
export class CustomerModule {}
