import type { Transporter } from "nodemailer";
import { resolveEmailFrom } from "./resolve-email-from";
import type { EmailSendInput, EmailSendResult, EmailTransport } from "./email-transport";

/** Wraps an already-constructed nodemailer transporter behind `EmailTransport`. */
export class SmtpEmailTransport implements EmailTransport {
  constructor(private readonly transporter: Transporter) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: resolveEmailFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { providerMessageId: typeof info.messageId === "string" ? info.messageId : null };
  }
}
