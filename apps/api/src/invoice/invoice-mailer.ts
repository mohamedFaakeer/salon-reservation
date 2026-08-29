import { Injectable, Logger } from "@nestjs/common";
import type { Invoice } from "../entities/invoice.entity";
import type { RenderedInvoice } from "./invoice-template";
import { resolveEmailTransport } from "../notification/providers/resolve-email-transport";
import type { EmailTransport } from "../notification/providers/email-transport";

/**
 * Sends an invoice by email.
 *
 * Separate from `NotificationService` on purpose. That pipeline exists to
 * record per-channel delivery attempts against an *appointment* and retry
 * them, and its rows carry no subject or body. An invoice is a document with
 * an HTML part and its own audit trail, and forcing it through a schema built
 * for "reminder sent / failed" would have meant bending both.
 *
 * Same email configuration as `EmailNotificationProvider`
 * (`resolveEmailTransport()` — Brevo API when `BREVO_API_KEY` is set,
 * otherwise SMTP), and the same honest fallback: with neither configured the
 * message is logged rather than silently dropped, so a demo shows exactly
 * what a customer would have received.
 */
@Injectable()
export class InvoiceMailer {
  private readonly logger = new Logger(InvoiceMailer.name);
  private readonly transport: EmailTransport | null;

  constructor() {
    this.transport = resolveEmailTransport();
  }

  async send(to: string, invoice: Invoice, rendered: RenderedInvoice): Promise<void> {
    if (!this.transport) {
      // Not an error and not silence: without email configured this is what
      // a demo is supposed to do, and the operator can see the exact document.
      this.logger.log(
        `[invoice:no-email-transport] to=${to} subject="${rendered.subject}"\n${rendered.text}`,
      );
      return;
    }

    // Both parts: a client that refuses HTML should still show the customer
    // what they paid rather than an empty message.
    await this.transport.send({ to, subject: rendered.subject, text: rendered.text, html: rendered.html });

    this.logger.log(`Invoice ${invoice.number} sent to ${to}`);
  }
}
