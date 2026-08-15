import { Injectable } from "@nestjs/common";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "./notification-provider.interface";

/** Decision Q4: "Log (console) + email only" — the guaranteed-offline default, always succeeds. */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    // Deliberate: this provider's entire purpose is to log to the console.
    // eslint-disable-next-line no-console
    console.log(`[notification] to=${input.recipient} subject="${input.subject}"\n${input.body}`);
    return { providerMessageId: null };
  }
}
