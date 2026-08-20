import type { DashboardSummary } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";

/**
 * Summary cards for whatever period is on screen.
 *
 * The live cards — check-ins, waiting, in service — are dropped entirely when
 * the range does not include today, rather than shown as zero. Zero is a
 * claim, and "nobody is in the chair" is a true statement about right now and
 * a meaningless one about last March. Dropping them also stops an operator
 * reading a historical range and thinking the salon is empty.
 */
export function DashboardStats({ stats }: { stats: DashboardSummary }) {
  const live = stats.live;

  const cards: Array<{ testId: string; label: string; value: string }> = [
    ...(live
      ? [
          { testId: "checked-in", label: "Check-ins", value: String(live.checkedInNow) },
          { testId: "waiting", label: "Waiting", value: String(live.waitingLate) },
          { testId: "in-service", label: "In service", value: String(live.inServiceNow) },
        ]
      : [{ testId: "appointments", label: "Appointments", value: String(stats.appointments) }]),
    {
      testId: "expected-revenue",
      label: live ? "Expected revenue" : "Revenue",
      value: formatPriceCents(stats.expectedRevenueCents),
    },
    {
      testId: "outstanding",
      label: "Outstanding",
      value: formatPriceCents(stats.outstandingCents),
    },
    { testId: "cancellations", label: "Cancellations", value: String(stats.cancellations) },
    { testId: "no-shows", label: "No-shows", value: String(stats.noShows) },
  ];

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${
        cards.length === 7 ? "xl:grid-cols-7" : "xl:grid-cols-5"
      }`}
    >
      {cards.map((card) => (
        <div
          key={card.testId}
          data-testid={`stat-card-${card.testId}`}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <p className="text-xs font-medium text-slate-500">{card.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 tabular">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
