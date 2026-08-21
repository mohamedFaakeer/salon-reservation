import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import type { Invoice } from "../entities/invoice.entity";
import type { RenderedInvoice } from "./invoice-template";

/**
 * Sends an invoice by email.
 *
 * Separate from `NotificationService` on purpose. That pipeline exists to
 * record per-channel delivery attempts against an *appointment* and retry
 * them, and its rows carry no subject or body. An invoice is a document with
 * an HTML part and its own audit trail, and forcing it through a schema built
 * for "reminder sent / failed" would have meant bending both.
 *
 * Same SMTP configuration, and the same honest fallback: with `SMTP_HOST`
 * unset the message is logged rather than silently dropped, so a demo shows
 * exactly what a customer would have received.
 */
@Injectable()
export class InvoiceMailer {
  private readonly logger = new Logger(InvoiceMailer.name);
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        })
      : null;
  }

  async send(to: string, invoice: Invoice, rendered: RenderedInvoice): Promise<void> {
    if (!this.transporter) {
      // Not an error and not silence: without SMTP configured this is what a
      // demo is supposed to do, and the operator can see the exact document.
      this.logger.log(
        `[invoice:no-smtp] to=${to} subject="${rendered.subject}"\n${rendered.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_USER ?? "no-reply@salon.local",
      to,
      subject: rendered.subject,
      // Both parts: a client that refuses HTML should still show the customer
      // what they paid rather than an empty message.
      text: rendered.text,
      html: rendered.html,
    });

    this.logger.log(`Invoice ${invoice.number} sent to ${to}`);
  }
}
