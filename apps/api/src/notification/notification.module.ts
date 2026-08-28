import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "../entities/notification.entity";
import { NotificationRule } from "../entities/notification-rule.entity";
import { NotificationTemplate } from "../entities/notification-template.entity";
import { NotificationLog } from "../entities/notification-log.entity";
import { CustomerNotificationPreferences } from "../entities/customer-notification-preferences.entity";
import { NotificationQuota } from "../entities/notification-quota.entity";
import { NotificationEventSetting } from "../entities/notification-event-setting.entity";
import { Appointment } from "../entities/appointment.entity";
import { Tenant } from "../entities/tenant.entity";
import { Customer } from "../entities/customer.entity";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationScheduler } from "./notification.scheduler";
import { NotificationEvaluatorService } from "./services/notification-evaluator.service";
import { NotificationSchedulerService } from "./services/notification-scheduler.service";
import { TemplateRendererService } from "./services/template-renderer.service";
import { SystemTemplatesService } from "./services/system-templates.service";
import { ConsoleNotificationProvider } from "./providers/console.provider";
import { EmailNotificationProvider } from "./providers/email.provider";
import { SmsNotificationProvider } from "./providers/sms.provider";
import { WhatsAppNotificationProvider } from "./providers/whatsapp.provider";
import { NotificationProviderResolver } from "./providers/resolve-notification-provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationRule,
      NotificationTemplate,
      NotificationLog,
      CustomerNotificationPreferences,
      NotificationQuota,
      NotificationEventSetting,
      Appointment,
      Tenant,
      Customer,
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationScheduler,
    NotificationEvaluatorService,
    NotificationSchedulerService,
    TemplateRendererService,
    SystemTemplatesService,
    ConsoleNotificationProvider,
    EmailNotificationProvider,
    SmsNotificationProvider,
    WhatsAppNotificationProvider,
    NotificationProviderResolver,
  ],
  exports: [
    NotificationService,
    NotificationEvaluatorService,
    NotificationSchedulerService,
    TemplateRendererService,
    SystemTemplatesService,
    // Customer-account phone verification (customer-auth module) rides this
    // same Text.lk connection rather than duplicating SMS-sending logic.
    SmsNotificationProvider,
  ],
})
export class NotificationModule {}
