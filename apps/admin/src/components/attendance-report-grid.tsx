"use client";

import type { AttendanceDayView, AttendanceReport, StaffMember } from "../lib/api-client";
import { attendanceStatusStyle, formatMinutesDuration, formatTime, todayLocalDate, type StatusStyle } from "../lib/format";

/**
 * Staff × day attendance, mirroring `RotaGrid`'s row/column shape and its
 * mobile-accordion fallback so the vocabulary — and the "one disclosure per
 * stylist on a phone" trade-off — stays consistent between the two staff
 * grids this app has. Every cell always resolves to one of the app's seven
 * attendance statuses, never a blank "no record": the server has already
 * cross-referenced the punch against the rota, leave and closures before
 * this ever renders (`AttendanceService.buildReport`), so a rostered day
 * that hasn't happened yet reads "Not in yet," not nothing.
 */
export function AttendanceReportGrid({ report, staff }: { report: AttendanceReport; staff: StaffMember[] }) {
  const colorFor = new Map(staff.map((s) => [s.id, s.color]));
  const dates = Array.from(new Set(report.days.map((d) => d.workDate))).sort();
  const byStaffDate = new Map<string, AttendanceDayView>();
  for (const day of report.days) {
    byStaffDate.set(`${day.staffId}:${day.workDate}`, day);
  }
  const today = todayLocalDate();

  return (
    <>
      {/* Same "grid gets hard to use on a phone" trade-off as RotaGrid — one
          disclosure per stylist, days listed vertically. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {report.summary.map((person, idx) => (
          <details
            key={person.staffId}
            data-testid={`mobile-attendance-row-${person.staffId}`}
            className="rounded-lg border border-slate-200 bg-white"
            open={idx === 0}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 py-2.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor.get(person.staffId) ?? "#475569" }}
              />
              <span className="flex-1 font-medium text-slate-900">{person.staffName}</span>
              <span className="tabular text-xs text-slate-500">{formatMinutesDuration(person.workedMinutes)}</span>
            </summary>
            <div className="flex flex-col border-t border-slate-100">
              {dates.map((date) => {
                const day = byStaffDate.get(`${person.staffId}:${date}`);
                const cell = cellContent(day);
                return (
                  <div
                    key={date}
                    className={`flex items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2 first:border-t-0 ${
                      date === today ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <span className="text-sm text-slate-700">
                      {formatDayLabel(date)}
                      {date === today ? <span className="ml-1 text-xs font-medium text-teal-700">Today</span> : null}
                    </span>
                    <span
                      className="tabular rounded px-2 py-0.5 text-right text-xs font-semibold"
                      style={{ backgroundColor: cell.style.fill, color: cell.style.fg }}
                    >
                      {cell.text}
                      {cell.sub ? <span className="block text-[9px] font-medium opacity-80">{cell.sub}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Attendance by stylist and day</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                scope="col"
                className="min-w-36 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500"
              >
                Stylist
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  scope="col"
                  className={`px-2 py-2 text-center text-[10px] font-medium uppercase tracking-[0.1em] ${
                    date === today ? "text-teal-700" : "text-slate-500"
                  }`}
                >
                  {formatDayLabel(date)}
                  {date === today ? " · Today" : ""}
                </th>
              ))}
              <th
                scope="col"
                className="min-w-40 border-l border-slate-200 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500"
              >
                This range
              </th>
            </tr>
          </thead>
          <tbody>
            {report.summary.map((person) => (
              <tr key={person.staffId} data-testid={`attendance-row-${person.staffId}`} className="border-b border-slate-100 last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorFor.get(person.staffId) ?? "#475569" }}
                    />
                    {person.staffName}
                  </span>
                </th>
                {dates.map((date) => {
                  const day = byStaffDate.get(`${person.staffId}:${date}`);
                  const cell = cellContent(day);
                  return (
                    <td key={date} className={`border-l border-slate-100 p-1 text-center ${date === today ? "bg-teal-50/50" : ""}`}>
                      <span
                        data-testid={`attendance-cell-${person.staffId}-${date}`}
                        className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded px-1 py-1"
                        style={{ backgroundColor: cell.style.fill, color: cell.style.fg }}
                      >
                        <span className="tabular text-[11px] font-semibold">{cell.text}</span>
                        {cell.sub ? <span className="text-[9px] font-medium opacity-80">{cell.sub}</span> : null}
                      </span>
                    </td>
                  );
                })}
                <td className="border-l border-slate-200 px-3 py-2">
                  <span className="tabular block text-sm font-semibold text-slate-900">
                    {formatMinutesDuration(person.workedMinutes)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <SummaryChip count={person.presentDays} label="Present" fill="#D1FAE5" fg="#065F46" />
                    <SummaryChip count={person.lateDays} label="Late" fill="#FED7AA" fg="#9A3412" />
                    <SummaryChip count={person.absentDays} label="Absent" fill="#334155" fg="#FFFFFF" />
                    <SummaryChip count={person.missingCheckOutDays} label="Missing" fill="#FED7AA" fg="#9A3412" />
                    <SummaryChip count={person.leaveDays} label="Leave" fill="#CFFAFE" fg="#155E75" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SummaryChip({ count, label, fill, fg }: { count: number; label: string; fill: string; fg: string }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: fill, color: fg }}>
      {label} {count}
    </span>
  );
}

/** A day's cell: the actual punch times when there's a check-in, otherwise the status label — never a blank. */
function cellContent(day: AttendanceDayView | undefined): { text: string; sub: string | null; style: StatusStyle } {
  if (!day) {
    return { text: "—", sub: null, style: attendanceStatusStyle("EXPECTED") };
  }
  const style = attendanceStatusStyle(day.status);
  if (day.checkInAt) {
    const text = `${formatTime(day.checkInAt)}–${day.checkOutAt ? formatTime(day.checkOutAt) : "…"}`;
    const sub = day.lateMinutes > 0 ? `+${day.lateMinutes}m late` : null;
    return { text, sub, style };
  }
  return { text: style.label, sub: null, style };
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-LK", { weekday: "short", day: "numeric" });
}
