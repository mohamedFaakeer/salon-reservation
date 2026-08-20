"use client";

/**
 * Offset pagination over a list whose server reports an unpaged total.
 *
 * It states the range and the total rather than a page number, because "51-75
 * of 214" answers the question an operator actually has — how much is left —
 * while "page 3" only makes sense once you already know the page size.
 */
export function Pager({
  total,
  limit,
  offset,
  onOffsetChange,
  unit,
  busy = false,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (next: number) => void;
  /**
   * Singular noun for the things being counted, e.g. "customer". Pluralised
   * here so a list of one does not read "1 bookings".
   */
  unit: string;
  busy?: boolean;
}) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  const hasPrevious = offset > 0;
  const hasNext = last < total;

  if (total <= limit && offset === 0) {
    // One page: a pager here would be three controls that do nothing.
    return (
      <p className="text-xs text-slate-500">
        {total} {plural(unit, total)}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p data-testid="pager-range" className="text-xs text-slate-600 tabular">
        {first}–{last} of {total} {plural(unit, total)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="pager-previous"
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          disabled={!hasPrevious || busy}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Previous
        </button>
        <button
          type="button"
          data-testid="pager-next"
          onClick={() => onOffsetChange(offset + limit)}
          disabled={!hasNext || busy}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * Sufficient for the nouns this app counts: customer, booking, payment, entry.
 * The -y rule earns its place because "entrys" is the kind of detail that makes
 * a screen look unfinished.
 */
function plural(unit: string, count: number): string {
  if (count === 1) {
    return unit;
  }
  return /[^aeiou]y$/.test(unit) ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}
