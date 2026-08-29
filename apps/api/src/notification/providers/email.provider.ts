import { Injectable } from "@nestjs/common";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "./notification-provider.interface";
import { resolveEmailTransport } from "./resolve-email-transport";
import type { EmailTransport } from "./email-transport";

/**
 * Real email send when `BREVO_API_KEY` or `SMTP_HOST` is configured (Decision
 * Q4: "Gmail/Outlook app password... or console/log provider"; `BrevoApiEmailTransport`
 * for the Render-friendly path added afterward). Falls back to the same
 * console-logging behavior as `ConsoleNotificationProvider` when neither is
 * set, so the demo is never broken by missing email config.
 */
@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  private readonly transport: EmailTransport | null;

  constructor() {
    this.transport = resolveEmailTransport();
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (!this.transport) {
      // eslint-disable-next-line no-console
      console.log(`[notification:email-fallback] to=${input.recipient} subject="${input.subject}"\n${input.body}`);
      return { providerMessageId: null };
    }
    return this.transport.send({ to: input.recipient, subject: input.subject, text: input.body });
  }
}
