/**
 * Invoice numbers: `EAGL-2026-0001`.
 *
 * Salon, year, then a counter that restarts each January. Readable aloud over
 * a phone, sortable as text, and it says which salon and which year without
 * anybody having to look it up.
 *
 * Pure string work, kept apart from the service so the format can be tested
 * without a database — and so the one place it is decided is obvious.
 */

/** Four letters, so the prefix is stable whatever the slug's length. */
export function prefixForSlug(slug: string): string {
  const letters = slug.replace(/[^a-z0-9]/gi, "").toUpperCase();
  // Padded rather than truncated-and-hoped: a two-letter slug would otherwise
  // produce a prefix that collides with a different two-letter salon's.
  return letters.slice(0, 4).padEnd(4, "X");
}

export function invoiceNumberPrefix(slug: string, year: number): string {
  return `${prefixForSlug(slug)}-${year}-`;
}

export function formatInvoiceNumber(slug: string, year: number, sequence: number): string {
  // Four digits covers ten thousand invoices a year; beyond that the number
  // simply grows rather than wrapping and colliding.
  return `${invoiceNumberPrefix(slug, year)}${String(sequence).padStart(4, "0")}`;
}

/**
 * The next sequence, given the highest number already issued under this
 * prefix. Returns 1 when the salon has issued none this year.
 */
export function nextSequence(highestNumber: string | null | undefined, prefix: string): number {
  if (!highestNumber || !highestNumber.startsWith(prefix)) {
    return 1;
  }
  const tail = Number(highestNumber.slice(prefix.length));
  return Number.isFinite(tail) && tail > 0 ? tail + 1 : 1;
}
