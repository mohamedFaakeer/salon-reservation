/**
 * Resolves the visible "From" address/name for outgoing transactional email
 * (notifications and invoices — both mailers call this instead of reading
 * env vars directly, so the fallback chain lives in exactly one place).
 *
 * `EMAIL_FROM` is the intended display value, e.g.
 * `"Elegance Salon <bookings@example.com>"`. `SMTP_USER` is kept as a
 * fallback for deployments that never set `EMAIL_FROM`: before this helper
 * existed, `SMTP_USER` (the SMTP auth login) doubled as the visible sender,
 * which breaks the moment a provider's auth login isn't meant to be shown to
 * customers (Brevo's SMTP login, for one).
 */
export function resolveEmailFrom(): string {
  return process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "no-reply@salon.local";
}

/**
 * The same value as `resolveEmailFrom()`, split into `name`/`email` — needed
 * by Brevo's HTTP API, whose `sender` field is a `{ name, email }` object
 * rather than a single RFC 5322 string the way nodemailer's `from` accepts.
 * Accepts `"Display Name" <email>`, `Display Name <email>`, or a bare email.
 */
export function resolveEmailFromParts(): { name?: string; email: string } {
  const raw = resolveEmailFrom();
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(raw);
  if (match) {
    const name = match[1].trim();
    return { name: name.length > 0 ? name : undefined, email: match[2].trim() };
  }
  return { email: raw.trim() };
}
