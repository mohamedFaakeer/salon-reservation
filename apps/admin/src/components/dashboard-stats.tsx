import type { DashboardToday } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";

/** UX.md §4.2 Today screen: "Status summary cards (check-ins, waiting, in service, expected revenue, outstanding, cancellations, no-shows)". */
export function DashboardStats({ stats }: { stats: DashboardToday }) {
  const cards: Array<{ testId: string; label: string; value: string }> = [
    { testId: "checked-in", label: "Check-ins", value: String(stats.checkedInNow) },
    { testId: "waiting", label: "Waiting", value: String(stats.waitingLate) },
    { testId: "in-service", label: "In service", value: String(stats.inServiceNow) },
    { testId: "expected-revenue", label: "Expected revenue", value: formatPriceCents(stats.expectedRevenueCents) },
    { testId: "outstanding", label: "Outstanding", value: formatPriceCents(stats.outstandingCents) },
    { testId: "cancellations", label: "Cancellations", value: String(stats.cancellations) },
    { testId: "no-shows", label: "No-shows", value: String(stats.noShows) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => (
        <div
          key={card.testId}
          data-testid={`stat-card-${card.testId}`}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <p className="text-xs font-medium text-slate-500">{card.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
