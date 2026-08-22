import { randomBase32 } from "../appointment/booking-reference.util";

/**
 * `<3-letter tenant-slug prefix>-GC-<10 random base32 chars>`, e.g.
 * `ELE-GC-7F3K2M9PQR`.
 *
 * A gift card code is a bearer credential by design — the same way a
 * physical gift card works, whoever holds the code can spend it. That's
 * different from a booking reference, which is always paired with a
 * phone-number second factor before it unlocks anything, so a gift card
 * code needs materially more entropy on its own (10 random characters here
 * vs. 5 for a booking reference) plus its own dedicated rate limit
 * (RateLimitGuard), rather than leaning on a second factor that doesn't
 * exist for this credential.
 */
export function generateGiftCardCode(tenantSlug: string): string {
  const prefix = tenantSlug
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  return `${prefix}-GC-${randomBase32(10)}`;
}

export function normalizeGiftCardCode(code: string): string {
  return code.trim().toUpperCase();
}
