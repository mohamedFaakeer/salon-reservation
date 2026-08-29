import { Injectable, Logger } from "@nestjs/common";
import { resolveEmailTransport } from "../notification/providers/resolve-email-transport";

/**
 * The one place that emails the platform admin directly, outside the normal
 * per-tenant Notification pipeline — a deliberately small, standalone module
 * with no dependency on `audit` or `monitoring` (see those modules' own
 * comments for why: they call into this one, not the other way, to avoid a
 * circular module dependency).
 *
 * By design this is reserved for the small number of things worth
 * interrupting a human for immediately — HIGH/CRITICAL security events and
 * a tenant crossing its notification quota — not every flagged item. Lower
 * severities stay dashboard-only (the monitoring feature's whole reason for
 * existing is to hold everything else without demanding attention).
 */
@Injectable()
export class PlatformAlertService {
  private readonly logger = new Logger(PlatformAlertService.name);

  async send(subject: string, body: string): Promise<void> {
    const to = process.env.SUPER_ADMIN_EMAIL;
    if (!to) {
      this.logger.warn(`No SUPER_ADMIN_EMAIL configured — platform alert not sent: ${subject}`);
      return;
    }
    const transport = resolveEmailTransport();
    if (!transport) {
      // Same honest fallback every mailer in this codebase uses: no
      // configured transport means the alert is visible in logs, not lost
      // silently — and the dashboard still has it regardless.
      this.logger.warn(`No email transport configured — platform alert not sent: ${subject}`);
      return;
    }
    try {
      await transport.send({ to, subject, text: body });
    } catch (err) {
      // An alert that fails to send must never surface as an application
      // error — the event it was about is already safely recorded and
      // visible on the dashboard either way.
      this.logger.error(`Failed to send platform alert: ${subject}`, err instanceof Error ? err.stack : undefined);
    }
  }
}
