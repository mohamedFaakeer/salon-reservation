import { randomBase32 } from "../appointment/booking-reference.util";

/**
 * `<3-letter tenant-slug prefix>-PKG-<10 random base32 chars>`, e.g.
 * `ELE-PKG-7F3K2M9PQR`. Same entropy/format reasoning as
 * `generateGiftCardCode` — a package code is a bearer credential, so it
 * needs materially more entropy than a booking reference.
 */
export function generateServicePackageCode(tenantSlug: string): string {
  const prefix = tenantSlug
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  return `${prefix}-PKG-${randomBase32(10)}`;
}

export function normalizeServicePackageCode(code: string): string {
  return code.trim().toUpperCase();
}
