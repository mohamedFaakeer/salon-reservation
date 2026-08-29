/**
 * The one shape both email-sending strategies (`SmtpEmailTransport`,
 * `BrevoApiEmailTransport`) implement, so `EmailNotificationProvider` and
 * `InvoiceMailer` don't need to know which transport they got from
 * `resolveEmailTransport()`.
 */
export interface EmailSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailTransport {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
