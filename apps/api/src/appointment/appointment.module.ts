import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { Staff } from "../entities/staff.entity";
import { TenantModule } from "../tenant/tenant.module";
import { BookingModule } from "../booking/booking.module";
import { AppointmentController } from "./appointment.controller";
import { AppointmentService } from "./appointment.service";

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Staff]), TenantModule, BookingModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
