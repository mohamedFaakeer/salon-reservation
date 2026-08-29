/**
 * For the error/receipt messages that have to quote an amount back — never
 * for money actually stored or compared, which stays integer cents
 * everywhere per CLAUDE.md. Previously duplicated once in booking.service.ts
 * before payment.service.ts needed the identical formatting for its own
 * balance/refund errors (APT-10) — extracted here rather than duplicated a
 * second time or imported from a module that never exported it.
 */
export function formatCents(cents: number): string {
  return `LKR ${(cents / 100).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;
}
