import type { MonitoringSeverity, SecurityEventAction } from "@salon/shared";

/**
 * Severity is computed at read time, not stored — see DECISIONS.md's
 * monitoring entry for why: the rule can be tuned later (e.g. the
 * repeated-attempt threshold) without a migration or backfill.
 *
 * `recentCount` is "how many events of this same action + identifier have
 * happened in the lookback window the caller queried" — a single failed
 * login is noise; five in ten minutes is a brute-force attempt. Callers
 * compute this with one grouped query rather than one query per row (see
 * `monitoring.service.ts`).
 */
export function classifySecurityEventSeverity(
  action: SecurityEventAction,
  recentCount: number,
): MonitoringSeverity {
  switch (action) {
    case "REFRESH_TOKEN_REUSE_DETECTED":
      // A stolen/replayed session is always worth an immediate look —
      // there's no "isolated occurrence is fine" reading of this one.
      return "CRITICAL";
    case "CROSS_TENANT_TOKEN_REJECTED":
      // A JWT that verified but no longer entitles its bearer to the tenant
      // it claims — rare and always worth a look, but automatically blocked
      // already, so one shy of the "act right now" tier.
      return "HIGH";
    case "LOGIN_FAILED":
      if (recentCount >= 5) return "HIGH";
      if (recentCount >= 3) return "MEDIUM";
      return "LOW";
    case "RATE_LIMIT_EXCEEDED":
      // A sustained hit against the same rule is more likely a script/bot
      // than an isolated retry.
      return recentCount >= 5 ? "MEDIUM" : "LOW";
    default:
      return "LOW";
  }
}

/** 5xx errors: repetition is the signal — a one-off blip reads very differently from the same failure recurring. */
export function classifyErrorLogSeverity(statusCode: number, recentCount: number): MonitoringSeverity {
  if (recentCount >= 10) return "CRITICAL";
  if (recentCount >= 3) return "HIGH";
  if (statusCode >= 500) return "MEDIUM";
  return "LOW";
}
