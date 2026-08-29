/**
 * Shared nodemailer transport config for both mailers (`EmailNotificationProvider`
 * and `InvoiceMailer`) — `null` when `SMTP_HOST` is unset, matching each
 * caller's existing "fall back to console logging" behavior.
 *
 * The three timeouts exist because nodemailer has none by default: a
 * provider that never cleanly rejects (blocked outbound port, an
 * IP-restricted relay that drops the connection instead of erroring, a DNS
 * black hole, ...) would otherwise hang for minutes. Both mailers are
 * awaited synchronously from request-handling code (e.g. `booking.service.ts`
 * fires a booking-confirmation email inline while creating the appointment),
 * so an unbounded hang here stalls the customer's HTTP request, not just the
 * email — this is exactly what happened the first time real SMTP was
 * pointed at a host whose outbound network the provider didn't expect. 10s
 * per phase is generous for a real SMTP relay and short enough that a
 * customer never notices a mail-provider outage.
 */
export interface SmtpTransportOptions {
  host: string;
  port: number;
  auth?: { user: string; pass?: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

const TIMEOUT_MS = 10_000;

export function smtpTransportOptions(): SmtpTransportOptions | null {
  if (!process.env.SMTP_HOST) {
    return null;
  }
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  };
}
