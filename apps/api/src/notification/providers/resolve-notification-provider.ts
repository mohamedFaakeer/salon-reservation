import { Injectable } from "@nestjs/common";
import { NotificationChannel } from "@salon/shared";
// The four provider classes must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConsoleNotificationProvider } from "./console.provider";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmailNotificationProvider } from "./email.provider";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SmsNotificationProvider } from "./sms.provider";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { WhatsAppNotificationProvider } from "./whatsapp.provider";
import type { NotificationProvider } from "./notification-provider.interface";

@Injectable()
export class NotificationProviderResolver {
  constructor(
    private readonly console: ConsoleNotificationProvider,
    private readonly email: EmailNotificationProvider,
    private readonly sms: SmsNotificationProvider,
    private readonly whatsapp: WhatsAppNotificationProvider,
  ) {}

  resolve(channel: NotificationChannel): NotificationProvider {
    switch (channel) {
      case NotificationChannel.EMAIL:
        return this.email;
      case NotificationChannel.SMS:
        return this.sms;
      case NotificationChannel.WHATSAPP:
        return this.whatsapp;
      case NotificationChannel.CONSOLE:
      default:
        return this.console;
    }
  }
}
