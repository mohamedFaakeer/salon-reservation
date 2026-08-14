import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Staff } from "../entities/staff.entity";
import { TenantModule } from "../tenant/tenant.module";
import { BookingModule } from "../booking/booking.module";
import { AppointmentController } from "./appointment.controller";
import { AppointmentService } from "./appointment.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Staff, AppointmentServiceLine]),
    TenantModule,
    BookingModule,
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
