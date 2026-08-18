"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  deleteClosure,
  deleteLeave,
  fetchClosures,
  fetchLeave,
  fetchSchedules,
  fetchStaff,
  type ClosureRecord,
  type StaffLeaveRecord,
  type StaffMember,
  type WorkingSchedule,
} from "../../../lib/api-client";
import { canManageStaff } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { RotaGrid } from "../../../components/rota-grid";
import { ScheduleDrawer } from "../../../components/schedule-drawer";
import { LeaveDrawer } from "../../../components/leave-drawer";
import { ClosureDrawer } from "../../../components/closure-drawer";
import { BusyLabel } from "../../../components/spinner";
import { formatDateRange, todayLocalDate } from "../../../lib/format";

type Tab = "rota" | "leave" | "closures";

/** The seven dates of the current Mon–Sun week, so leave can be overlaid on the rota. */
function currentWeekDates(): string[] {
  const today = new Date(`${todayLocalDate()}T00:00:00Z`);
  // getUTCDay is Sun=0; the API's dayOfWeek is Mon=0, so shift accordingly.
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - mondayOffset + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Past entries are kept, greyed — they explain gaps in your own history. */
function periodTag(startDate: string, endDate: string): { label: string; className: string } {
  const today = todayLocalDate();
  if (endDate < today) {
    return { label: "Past", className: "bg-zinc-200 text-zinc-800" };
  }
  if (startDate <= today) {
    return { label: "In progress", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Upcoming", className: "bg-blue-100 text-blue-800" };
}

export default function AvailabilityPage() {
  const { user } = useAuth();
  const canManage = canManageStaff(user?.roles ?? []);

  const [tab, setTab] = useState<Tab>("rota");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [schedules, setSchedules] = useState<WorkingSchedule[]>([]);
  const [leave, setLeave] = useState<Record<string, StaffLeaveRecord[]>>({});
  const [closures, setClosures] = useState<ClosureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [editingDay, setEditingDay] = useState<{
    member: StaffMember;
    dayOfWeek: number;
    existing?: WorkingSchedule;
  } | null>(null);
  const [addingLeave, setAddingLeave] = useState(false);
  const [addingClosure, setAddingClosure] = useState(false);

  const weekDates = useMemo(currentWeekDates, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStaff(), fetchSchedules(), fetchClosures()])
      .then(async ([staffRows, scheduleRows, closureRows]) => {
        const active = staffRows.filter((s) => s.active);
        setStaff(active);
        setSchedules(scheduleRows);
        setClosures(closureRows);
        const pairs = await Promise.all(
          active.map(async (m) => [m.id, await fetchLeave(m.id)] as const),
        );
        setLeave(Object.fromEntries(pairs));
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load availability.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const allLeave = useMemo(
    () =>
      Object.entries(leave)
        .flatMap(([staffId, rows]) => rows.map((r) => ({ ...r, staffId })))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [leave],
  );

  async function removeLeave(staffId: string, id: string): Promise<void> {
    setRemovingId(id);
    setError(null);
    try {
      await deleteLeave(staffId, id);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not remove this leave.");
    } finally {
      setRemovingId(null);
    }
  }

  async function removeClosure(id: string): Promise<void> {
    setRemovingId(id);
    setError(null);
    try {
      await deleteClosure(id);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not remove this closure.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Availability</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Working hours, time off, and salon closures.
          </p>
        </div>
        {canManage && tab === "leave" ? (
          <button
            type="button"
            data-testid="add-leave-button"
            onClick={() => setAddingLeave(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Add leave
          </button>
        ) : null}
        {canManage && tab === "closures" ? (
          <button
            type="button"
            data-testid="add-closure-button"
            onClick={() => setAddingClosure(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            Add closure
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["rota", "Weekly rota"],
            ["leave", "Leave"],
            ["closures", "Closures"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`tab-${key}`}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`min-h-11 border-b-2 px-4 text-sm ${
              tab === key
                ? "border-teal-600 font-semibold text-teal-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tab === "rota" ? (
        staff.length === 0 ? (
          <EmptyState title="No active stylists yet — add someone on Staff & skills first." />
        ) : (
          <RotaGrid
            staff={staff}
            schedules={schedules}
            leave={leave}
            weekDates={weekDates}
            onEditDay={(member, dayOfWeek, existing) =>
              canManage ? setEditingDay({ member, dayOfWeek, existing }) : undefined
            }
          />
        )
      ) : tab === "leave" ? (
        allLeave.length === 0 ? (
          <EmptyState
            title="No leave booked."
            action={canManage ? { label: "Add leave", onClick: () => setAddingLeave(true) } : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {allLeave.map((row) => {
              const tag = periodTag(row.startDate, row.endDate);
              const member = staffById.get(row.staffId);
              return (
                <li
                  key={row.id}
                  data-testid={`leave-row-${row.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: member?.color ?? "#475569" }}
                    />
                    <span className="font-medium text-slate-900">{member?.name ?? "Stylist"}</span>
                    <span className="text-slate-500">
                      — {formatDateRange(row.startDate, row.endDate)}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tag.className}`}>
                      {tag.label}
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        data-testid={`remove-leave-${row.id}`}
                        onClick={() => void removeLeave(row.staffId, row.id)}
                        disabled={removingId === row.id}
                        className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <BusyLabel busy={removingId === row.id} busyText="Removing…">
                          Remove
                        </BusyLabel>
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : closures.length === 0 ? (
        <EmptyState
          title="No closures booked."
          action={canManage ? { label: "Add closure", onClick: () => setAddingClosure(true) } : undefined}
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {closures.map((row) => {
            const tag = periodTag(row.startDate, row.endDate);
            return (
              <li
                key={row.id}
                data-testid={`closure-row-${row.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="text-slate-500">
                    {" "}
                    — {formatDateRange(row.startDate, row.endDate)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${tag.className}`}>
                    {tag.label}
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      data-testid={`remove-closure-${row.id}`}
                      onClick={() => void removeClosure(row.id)}
                      disabled={removingId === row.id}
                      className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <BusyLabel busy={removingId === row.id} busyText="Removing…">
                        Remove
                      </BusyLabel>
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {editingDay ? (
        <ScheduleDrawer
          member={editingDay.member}
          dayOfWeek={editingDay.dayOfWeek}
          existing={editingDay.existing}
          onClose={() => setEditingDay(null)}
          onSaved={() => {
            setEditingDay(null);
            load();
          }}
        />
      ) : null}
      {addingLeave ? (
        <LeaveDrawer
          staff={staff}
          onClose={() => setAddingLeave(false)}
          onSaved={() => {
            setAddingLeave(false);
            load();
          }}
        />
      ) : null}
      {addingClosure ? (
        <ClosureDrawer
          onClose={() => setAddingClosure(false)}
          onSaved={() => {
            setAddingClosure(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
