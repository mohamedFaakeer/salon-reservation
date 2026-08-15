import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "./notification-provider.interface";

/**
 * Real SMTP send when `SMTP_HOST` is configured (Decision Q4: "Gmail/Outlook
 * app password... or console/log provider"). Falls back to the same
 * console-logging behavior as `ConsoleNotificationProvider` when unset, so
 * the demo is never broken by missing SMTP config.
 */
@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    if (!this.transporter) {
      // eslint-disable-next-line no-console
      console.log(`[notification:email-fallback] to=${input.recipient} subject="${input.subject}"\n${input.body}`);
      return { providerMessageId: null };
    }
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_USER ?? "no-reply@salon.local",
      to: input.recipient,
      subject: input.subject,
      text: input.body,
    });
    return { providerMessageId: typeof info.messageId === "string" ? info.messageId : null };
  }
}
