import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Service } from "../entities/service.entity";
import { SlotHold } from "../entities/slot-hold.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { AvailabilityModule } from "../availability/availability.module";
import { CustomerModule } from "../customer/customer.module";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { PricingModule } from "../pricing/pricing.module";
import { PaymentModule } from "../payment/payment.module";
import { NotificationModule } from "../notification/notification.module";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import { RatingModule } from "../rating/rating.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, SlotHold, Appointment, AppointmentServiceLine]),
    AvailabilityModule,
    CustomerModule,
    AuditModule,
    TenantModule,
    PricingModule,
    PaymentModule,
    NotificationModule,
    RatingModule,
  ],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
