"use client";

import type { StaffLeaveRecord, StaffMember, WorkingSchedule } from "../lib/api-client";
import { WEEKDAYS, minutesToTime } from "../lib/format";

/**
 * Weekly rota: stylists down, days across.
 *
 * Same grid idiom as the skills matrix so the vocabulary stays consistent, and
 * it answers "who is in on Thursday?" at a glance — a question a per-stylist
 * form cannot answer without opening every stylist in turn.
 *
 * Leave is drawn here even though it is edited on its own tab, because the
 * rota is where someone looks to find out whether a person is available.
 */
export function RotaGrid({
  staff,
  schedules,
  leave,
  weekDates,
  onEditDay,
}: {
  staff: StaffMember[];
  schedules: WorkingSchedule[];
  /** staffId -> leave rows, used only to overlay "on leave" on the grid. */
  leave: Record<string, StaffLeaveRecord[]>;
  /** The seven dates of the displayed week, Monday first, as YYYY-MM-DD. */
  weekDates: string[];
  onEditDay: (member: StaffMember, dayOfWeek: number, existing?: WorkingSchedule) => void;
}) {
  const byStaffDay = new Map<string, WorkingSchedule>();
  for (const s of schedules) {
    byStaffDay.set(`${s.staffId}:${s.dayOfWeek}`, s);
  }

  function leaveOn(staffId: string, date: string): StaffLeaveRecord | undefined {
    return (leave[staffId] ?? []).find((l) => date >= l.startDate && date <= l.endDate);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <caption className="sr-only">Weekly working hours by stylist</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th scope="col" className="min-w-36 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500">
              Stylist
            </th>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                scope="col"
                className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => {
            const days = WEEKDAYS.map((_, i) => byStaffDay.get(`${member.id}:${i}`));
            const worksAnyDay = days.some(Boolean);
            return (
              <tr
                key={member.id}
                data-testid={`rota-row-${member.id}`}
                className="border-b border-slate-100 last:border-b-0"
              >
                <th scope="row" className="px-3 py-2 text-left font-medium text-slate-900">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: member.color ?? "#475569" }}
                    />
                    {member.name}
                  </span>
                </th>

                {/* Seven identical "Off" cells would read as a deliberate week
                    of rest. One honest row says what it actually means. */}
                {!worksAnyDay ? (
                  <td colSpan={7} className="bg-amber-50 px-3 py-3 text-center">
                    <span
                      data-testid={`rota-nohours-${member.id}`}
                      className="text-xs font-medium text-amber-800"
                    >
                      No hours set — {member.name} can&apos;t be booked on any day
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditDay(member, 0, undefined)}
                      className="ml-3 min-h-11 rounded border border-amber-400 px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                    >
                      Set hours
                    </button>
                  </td>
                ) : (
                  days.map((sched, dayIndex) => {
                    const away = leaveOn(member.id, weekDates[dayIndex]);
                    return (
                      <td key={dayIndex} className="border-l border-slate-100 p-0 text-center">
                        <button
                          type="button"
                          data-testid={`rota-cell-${member.id}-${dayIndex}`}
                          onClick={() => onEditDay(member, dayIndex, sched)}
                          className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 hover:bg-slate-50 ${
                            away ? "bg-amber-50" : ""
                          }`}
                        >
                          {away ? (
                            <>
                              <span className="text-xs font-semibold text-amber-800">On leave</span>
                              <span className="text-[10px] text-amber-700">
                                {away.reason ?? "Away"}
                              </span>
                            </>
                          ) : sched ? (
                            <>
                              <span className="tabular text-xs font-semibold text-slate-900">
                                {minutesToTime(sched.startMin)}–{minutesToTime(sched.endMin)}
                              </span>
                              {sched.breakStartMin !== null ? (
                                <span className="tabular text-[10px] text-slate-500">
                                  break {minutesToTime(sched.breakStartMin)}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">Off</span>
                          )}
                        </button>
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
