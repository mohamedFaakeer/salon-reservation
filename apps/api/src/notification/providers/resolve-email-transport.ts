import nodemailer from "nodemailer";
import { BrevoApiEmailTransport } from "./brevo-api-email-transport";
import { SmtpEmailTransport } from "./smtp-email-transport";
import { smtpTransportOptions } from "./smtp-transport-options";
import type { EmailTransport } from "./email-transport";

/**
 * `BREVO_API_KEY` takes priority over `SMTP_HOST` when both are set — the
 * HTTP API is the right default for Render (no fixed outbound IP to
 * allow-list with Brevo's SMTP relay; see `BrevoApiEmailTransport`). SMTP
 * stays available for local development (already proven working against
 * Brevo's SMTP relay from a developer machine, which *can* be IP-authorized)
 * and for any provider that doesn't offer an equivalent API. `null` when
 * neither is configured, matching the existing "fall back to console
 * logging" behavior both mailers already had.
 */
export function resolveEmailTransport(): EmailTransport | null {
  if (process.env.BREVO_API_KEY) {
    return new BrevoApiEmailTransport(process.env.BREVO_API_KEY);
  }
  const options = smtpTransportOptions();
  return options ? new SmtpEmailTransport(nodemailer.createTransport(options)) : null;
}
