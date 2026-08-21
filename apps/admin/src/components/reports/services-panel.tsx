import type { ServiceCount } from "../../lib/api-client";
import { formatPriceCents } from "../../lib/format";
import { Card, Insight, Panel, Quiet } from "./report-shell";

/**
 * Most booked beside most earned.
 *
 * Deliberately adjacent, because the two lists disagreeing is the finding: a
 * cheap fringe trim can top the popularity list while contributing almost
 * nothing to the takings. Stacked, or on separate tabs, that comparison never
 * gets made.
 */
export function ServicesPanel({
  popular,
  byRevenue,
}: {
  popular: ServiceCount[];
  byRevenue: ServiceCount[];
}) {
  if (popular.length === 0) {
    return (
      <Panel title="Services">
        <Card>
          <Quiet>Nothing was booked in this period.</Quiet>
        </Card>
      </Panel>
    );
  }

  return (
    <Panel title="Services" note="the two lists disagreeing is the point">
      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked
          heading="Most booked"
          unit="Times"
          rows={popular}
          value={(s) => String(s.count)}
          weight={(s) => s.count}
          testId="report-popular"
        />
        <Ranked
          heading="Most earned"
          unit="Revenue"
          rows={byRevenue}
          value={(s) => formatPriceCents(s.revenueCents)}
          weight={(s) => s.revenueCents}
          testId="report-revenue"
        />
      </div>

      {(() => {
        const point = mismatch(popular, byRevenue);
        return point ? <Insight>{point}</Insight> : null;
      })()}
    </Panel>
  );
}

function Ranked({
  heading,
  unit,
  rows,
  value,
  weight,
  testId,
}: {
  heading: string;
  unit: string;
  rows: ServiceCount[];
  value: (row: ServiceCount) => string;
  weight: (row: ServiceCount) => number;
  testId: string;
}) {
  const top = Math.max(...rows.map(weight), 1);

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
          {heading}
        </h3>
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
          {unit}
        </span>
      </div>
      <ol className="m-0 list-none p-0" data-testid={testId}>
        {rows.map((row, i) => (
          <li
            key={row.name}
            className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-2.5 last:border-b-0"
          >
            <span className="w-4 shrink-0 text-xs text-slate-400 tabular">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-slate-800">{row.name}</span>
              {/* The bar is the comparison; the number is the fact. */}
              <span className="mt-1.5 block h-1 rounded-full bg-teal-100">
                <span
                  className="block h-full rounded-full bg-teal-600"
                  style={{ width: `${(weight(row) / top) * 100}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 font-medium tabular">{value(row)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * Written only when the top of one list is not the top of the other, and the
 * gap is wide enough to matter. Otherwise the two lists agree and saying so
 * adds nothing.
 */
function mismatch(popular: ServiceCount[], byRevenue: ServiceCount[]): string | null {
  const mostBooked = popular[0];
  const mostEarned = byRevenue[0];
  if (!mostBooked || !mostEarned || mostBooked.name === mostEarned.name) {
    return null;
  }
  if (mostEarned.count === 0 || mostBooked.revenueCents >= mostEarned.revenueCents) {
    return null;
  }
  const timesMoreOften = Math.round(mostBooked.count / Math.max(1, mostEarned.count));
  if (timesMoreOften < 2) {
    return null;
  }
  return `${mostBooked.name} is booked ${timesMoreOften} times more often than ${mostEarned.name}, and earns ${formatPriceCents(mostBooked.revenueCents)} against ${formatPriceCents(mostEarned.revenueCents)}. Most booked is not most valuable.`;
}
