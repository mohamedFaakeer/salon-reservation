import type { StaffReportRow } from "../../lib/api-client";
import { Card, Insight, Panel, Quiet, Td, Th } from "./report-shell";

/**
 * The stylist league table, with the honesty built in.
 *
 * A raw finished-job count punishes whoever takes the long work — one colour
 * treatment is three haircuts — so utilisation sits beside it. The insight
 * underneath is written only when those two columns actually disagree,
 * because a takeaway that appears every time is wallpaper.
 */
export function StaffPanel({ staff }: { staff: StaffReportRow[] }) {
  const active = staff.filter((s) => s.rosteredMinutes > 0 || s.completed > 0);

  return (
    <Panel title="Stylists" note="jobs finished, how full the diary was, how it was rated, and late arrivals">
      <Card>
        {active.length === 0 ? (
          <Quiet>Nobody was rostered or finished a job in this period.</Quiet>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Stylist performance for the selected period</caption>
              <thead>
                <tr>
                  <Th>Stylist</Th>
                  <Th align="right">Finished</Th>
                  <Th>Diary filled</Th>
                  <Th align="right">Booked</Th>
                  <Th align="right">Rating</Th>
                  <Th align="right">Late</Th>
                </tr>
              </thead>
              <tbody>
                {[...active]
                  .sort((a, b) => b.completed - a.completed)
                  .map((row) => (
                    <tr key={row.staffId} data-testid={`report-staff-${row.staffId}`}>
                      <Td className="font-medium text-slate-900">{row.name}</Td>
                      <Td align="right" className="tabular">
                        {row.completed}
                      </Td>
                      <Td>
                        <Utilisation percent={row.utilisationPercent} />
                      </Td>
                      <Td align="right" className="text-slate-500 tabular">
                        {row.bookedMinutes.toLocaleString()} min
                      </Td>
                      <Td align="right">
                        {row.averageRating === null ? (
                          <span className="text-xs text-slate-400">Not rated</span>
                        ) : (
                          <>
                            <span className="font-semibold text-teal-700 tabular">
                              {row.averageRating}
                            </span>{" "}
                            <span className="text-slate-500 tabular">({row.ratingCount})</span>
                          </>
                        )}
                      </Td>
                      <Td align="right" className="tabular">
                        {row.lateArrivals > 0 ? (
                          <span className="font-medium text-amber-700">{row.lateArrivals}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(() => {
        const point = misreadRisk(active);
        return point ? <Insight>{point}</Insight> : null;
      })()}
    </Panel>
  );
}

/**
 * A ratio deserves to be drawn as one. Null is spelled out rather than shown
 * as an empty bar — "not rostered" and "rostered but idle" look identical
 * otherwise, and only one of them is anybody's fault.
 */
function Utilisation({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-xs text-slate-400">Not rostered</span>;
  }
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-1.5 w-full max-w-[132px] overflow-hidden rounded-full bg-slate-100">
        <span
          className={`block h-full rounded-full ${percent >= 50 ? "bg-teal-600" : "bg-slate-300"}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </span>
      <span className="w-9 text-right font-medium tabular">{percent}%</span>
    </span>
  );
}

/**
 * The one sentence worth adding: somebody whose job count reads low but whose
 * diary was fuller than a busier-looking colleague's. That is exactly the
 * misreading the finished column invites, and the only case worth spending a
 * callout on.
 */
function misreadRisk(staff: StaffReportRow[]): string | null {
  const rated = staff.filter((s) => s.utilisationPercent !== null);
  if (rated.length < 2) {
    return null;
  }
  const busiest = [...rated].sort((a, b) => b.completed - a.completed)[0];
  const quietLooking = rated.find(
    (s) => s.staffId !== busiest.staffId && s.completed < busiest.completed / 2,
  );
  if (!quietLooking || quietLooking.utilisationPercent === null || busiest.utilisationPercent === null) {
    return null;
  }
  // Only worth saying when the diary contradicts the job count.
  if (quietLooking.utilisationPercent < busiest.utilisationPercent - 10) {
    return null;
  }
  return `${quietLooking.name} finished ${quietLooking.completed} to ${busiest.name}'s ${busiest.completed}, but filled ${quietLooking.utilisationPercent}% of the diary against ${busiest.utilisationPercent}% — longer appointments, not a quieter week.`;
}
