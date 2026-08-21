import type { CollectionReport, LossReport } from "../../lib/api-client";
import { formatPriceCents } from "../../lib/format";
import { Card, Figure, Panel } from "./report-shell";

/**
 * Money in, money back out, and money that never arrived.
 *
 * A dense figures strip rather than four cards: these four are read together
 * as one sentence about the period, and four separate containers would
 * suggest four separate questions.
 *
 * Refunds sit beside the total instead of being netted into it. Both are real
 * and answer different things — what came through the till, and what went
 * back out — and a single "net" figure hides the second.
 */

/** Teal ramp for the method split. Magnitude only; it carries no state. */
const METHOD_SHADES = ["#0d9488", "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1"];

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD_CAPTURED: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
  GATEWAY: "Gateway",
};

export function TakingsPanel({
  collection,
  losses,
  days,
}: {
  collection: CollectionReport;
  losses: LossReport;
  days: number;
}) {
  const payments = collection.byMethod.reduce((sum, m) => sum + m.count, 0);
  const perDay = days > 0 ? Math.round(collection.netCents / days) : 0;
  const emptyChairs = losses.noShows + losses.cancellations;

  return (
    <Panel title="Takings">
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Figure
            label="Collected"
            value={formatPriceCents(collection.totalCents)}
            detail={payments === 1 ? "1 payment" : `across ${payments} payments`}
          />
          <Figure
            label="Refunded"
            value={formatPriceCents(collection.refundedCents)}
            detail={collection.refundedCents === 0 ? "none this period" : undefined}
          />
          <Figure
            label="Net"
            value={formatPriceCents(collection.netCents)}
            detail={days > 1 ? `${formatPriceCents(perDay)} a day` : undefined}
          />
          <Figure
            label="Lost to empty chairs"
            value={formatPriceCents(losses.lostRevenueCents)}
            tone={losses.lostRevenueCents > 0 ? "warn" : "plain"}
            detail={
              emptyChairs === 0
                ? "nobody missed a booking"
                : `${losses.noShows} no-show${losses.noShows === 1 ? "" : "s"} · ${losses.cancellations} cancelled`
            }
          />
        </div>

        {collection.totalCents > 0 ? (
          <MethodSplit collection={collection} />
        ) : (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            No payments were taken in this period.
          </p>
        )}
      </Card>
    </Panel>
  );
}

/**
 * One proportional bar rather than another row of numbers. The question a
 * method split answers is "how much of it was cash", which is a proportion.
 */
function MethodSplit({ collection }: { collection: CollectionReport }) {
  return (
    <div className="border-t border-slate-200 px-4 py-3">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={collection.byMethod
          .map((m) => `${METHOD_LABELS[m.method] ?? m.method} ${formatPriceCents(m.amountCents)}`)
          .join(", ")}
      >
        {collection.byMethod.map((m, i) => (
          <span
            key={m.method}
            style={{
              width: `${(m.amountCents / collection.totalCents) * 100}%`,
              background: METHOD_SHADES[i % METHOD_SHADES.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {collection.byMethod.map((m, i) => (
          <li key={m.method} className="flex items-center gap-1.5 text-xs text-slate-700">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: METHOD_SHADES[i % METHOD_SHADES.length] }}
            />
            {METHOD_LABELS[m.method] ?? m.method}
            <b className="font-semibold tabular">{formatPriceCents(m.amountCents)}</b>
            <span className="text-slate-500 tabular">· {m.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
