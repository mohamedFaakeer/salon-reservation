export type DependencyStatus = "healthy" | "degraded" | "down" | "not_configured" | "not_applicable";
export type IssueOrigin = "ours" | "provider" | null;

export interface ServiceStatusEntry {
  id: "database" | "cloudinary" | "email" | "sms" | "hosting" | "payments";
  label: string;
  status: DependencyStatus;
  origin: IssueOrigin;
  /** Always an authored, human-readable string — never a raw driver/SDK error or stack trace (resilience audit, security review). */
  message: string;
  lastCheckedAt: string;
  lastErrorAt: string | null;
}

/** How far back a failure still counts as "currently" degraded, not stale history. */
export const RECENT_FAILURE_WINDOW_MS = 30 * 60_000;

/** Postgres SQLSTATEs for a rejected credential, not an unreachable server — a misconfiguration, not an outage. */
const DB_AUTH_ERROR_CODES = new Set(["28P01", "28000"]);

export function classifyDatabaseError(err: unknown): { origin: IssueOrigin; message: string } {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : undefined;
  if (code && DB_AUTH_ERROR_CODES.has(code)) {
    return { origin: "ours", message: "Credentials appear invalid — check DATABASE_URL on the API service." };
  }
  return { origin: "provider", message: "Unreachable — likely a Neon outage or a network issue." };
}

/** A bad phone number is a problem with one message, not evidence the SMS gateway itself is down. */
const DATA_ISSUE_PATTERN = /invalid recipient|invalid[^.]*(phone|number)/i;
const AUTH_ISSUE_PATTERN = /unauthorized|invalid[^.]*(key|token)|forbidden|\b401\b|\b403\b/i;

/**
 * `skip: true` means this failure shouldn't move the dependency out of
 * "healthy" — it's about one message/recipient, not the provider itself.
 */
export function classifyNotificationFailure(lastError: string): { origin: IssueOrigin; skip: boolean } {
  if (DATA_ISSUE_PATTERN.test(lastError)) {
    return { origin: null, skip: true };
  }
  if (AUTH_ISSUE_PATTERN.test(lastError)) {
    return { origin: "ours", skip: false };
  }
  return { origin: "provider", skip: false };
}

/** Same truncation discipline `ApiExceptionFilter` already applies to `error_log.message` — defense in depth, since this is our own authored text either way. */
export function sanitizeMessage(message: string, maxLength = 300): string {
  return message.length > maxLength ? `${message.slice(0, maxLength)}…` : message;
}
