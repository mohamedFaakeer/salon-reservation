const DURATION_RE = /^(\d+)([smhd])$/;
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses simple duration strings ("15m", "7d", "12h") into milliseconds.
 * Shared by every TTL knob in the auth module (access token, refresh token,
 * absolute session cap) so the format and fallback behavior stay identical
 * everywhere instead of each call site re-implementing its own regex.
 */
export function parseDurationMs(value: string | undefined, fallback: string): number {
  const match = DURATION_RE.exec(value ?? "") ?? DURATION_RE.exec(fallback);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
