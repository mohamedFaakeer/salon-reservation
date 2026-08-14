// No 0/O/1/I/L — avoids visually ambiguous characters when read aloud/typed.
const BASE32_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomBase32(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }
  return out;
}

/**
 * `<3-letter tenant-slug prefix>-<5 random base32 chars>`, e.g. `ELE-7F3K2`.
 * API.md's `ELN-7F3K2` is one illustrative example, not a documented
 * algorithm — this is our own reasonable interpretation (see DECISIONS.md).
 */
export function generateBookingReference(tenantSlug: string): string {
  const prefix = tenantSlug
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  return `${prefix}-${randomBase32(5)}`;
}
