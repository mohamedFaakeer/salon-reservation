import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { StaffNotification } from "../entities/staff-notification.entity";
import { StaffNotificationRead } from "../entities/staff-notification-read.entity";
import { StaffNotificationController } from "./staff-notification.controller";
import { StaffNotificationService } from "./staff-notification.service";

@Module({
  imports: [TypeOrmModule.forFeature([StaffNotification, StaffNotificationRead, Appointment])],
  controllers: [StaffNotificationController],
  providers: [StaffNotificationService],
  exports: [StaffNotificationService],
})
export class StaffNotificationModule {}
