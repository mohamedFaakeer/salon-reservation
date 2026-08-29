import { resolveEmailFromParts } from "./resolve-email-from";
import type { EmailSendInput, EmailSendResult, EmailTransport } from "./email-transport";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sends via Brevo's transactional HTTP API instead of SMTP relay.
 *
 * Brevo's SMTP relay enforces a per-account IP allow-list (a real security
 * feature — it stops a leaked SMTP credential being reused from an arbitrary
 * server) which doesn't fit a host with no fixed outbound IP, like Render's
 * free tier: the allow-listed IP can change on every deploy or restart. The
 * HTTP API authenticates with an API key in a request header over HTTPS
 * instead and isn't subject to that restriction — this is Brevo's own
 * recommended integration path for exactly this kind of platform, and it's
 * what fixed appointment creation hanging in production (booking.service.ts
 * awaits the confirmation email inline; an SMTP connection silently rejected
 * or blocked by network policy was stalling the whole booking request).
 */
export class BrevoApiEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: resolveEmailFromParts(),
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
        htmlContent: input.html ?? `<p>${escapeHtml(input.text)}</p>`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Brevo API send failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json().catch(() => null)) as { messageId?: string } | null;
    return { providerMessageId: data?.messageId ?? null };
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
