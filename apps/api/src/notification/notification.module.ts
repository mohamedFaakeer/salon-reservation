import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "../entities/notification.entity";
import { Appointment } from "../entities/appointment.entity";
import { Tenant } from "../entities/tenant.entity";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationScheduler } from "./notification.scheduler";
import { ConsoleNotificationProvider } from "./providers/console.provider";
import { EmailNotificationProvider } from "./providers/email.provider";
import { SmsNotificationProvider } from "./providers/sms.provider";
import { WhatsAppNotificationProvider } from "./providers/whatsapp.provider";
import { NotificationProviderResolver } from "./providers/resolve-notification-provider";

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Appointment, Tenant])],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationScheduler,
    ConsoleNotificationProvider,
    EmailNotificationProvider,
    SmsNotificationProvider,
    WhatsAppNotificationProvider,
    NotificationProviderResolver,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
