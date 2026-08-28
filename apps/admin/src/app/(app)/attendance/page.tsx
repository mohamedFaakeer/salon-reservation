"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import {
  attendanceCheckIn,
  attendanceCheckOut,
  fetchAttendanceBoard,
  type AttendanceDayView,
} from "../../../lib/api-client";
import { errorCopy } from "../../../lib/error-copy";
import { attendanceStatusStyle, formatTime, todayLocalDate } from "../../../lib/format";
import { canApproveAttendanceEdit } from "../../../lib/permissions";
import { useToast } from "../../../components/toast";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { EmptyState } from "../../../components/empty-state";
import { ModuleGate } from "../../../components/module-gate";

export default function AttendancePageGated() {
  return (
    <ModuleGate module="attendance" label="Attendance">
      <AttendancePage />
    </ModuleGate>
  );
}

/**
 * The front desk's punch board. One day, every staff member, one action per
 * row — check anyone in or out who has no login of their own, without
 * leaving the desk.
 */
function AttendancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayLocalDate());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AttendanceDayView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchAttendanceBoard(date)
      .then((res) => setRows(res.rows))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  async function punch(staffId: string, action: "in" | "out"): Promise<void> {
    setBusyId(staffId);
    try {
      if (action === "in") {
        await attendanceCheckIn(staffId);
      } else {
        await attendanceCheckOut(staffId);
      }
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  const present = rows.filter((r) => r.checkInAt).length;
  const late = rows.filter((r) => r.lateMinutes > 0).length;
  const missing = rows.filter((r) => r.status === "MISSING_CHECK_OUT").length;
  const onLeave = rows.filter((r) => r.status === "ON_LEAVE").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">
            {present} of {rows.length} staff have checked in
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayLocalDate()}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-10 rounded border border-slate-300 px-2.5 text-sm"
          />
          {user && canApproveAttendanceEdit(user.roles) ? (
            <Link
              href="/attendance/requests"
              className="flex min-h-10 items-center rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Correction requests
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={present} label="Present" />
        <Stat value={late} label="Late arrivals" tone={late > 0 ? "#92400E" : undefined} />
        <Stat value={missing} label="Missing check-out" tone={missing > 0 ? "#9A3412" : undefined} />
        <Stat value={onLeave} label="On leave" tone={onLeave > 0 ? "#155E75" : undefined} />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No staff to show for this date." />
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-3.5 py-2.5">Staff</th>
                <th className="px-3.5 py-2.5">Check-in</th>
                <th className="px-3.5 py-2.5">Check-out</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const style = attendanceStatusStyle(row.status);
                const label = row.lateMinutes > 0 ? `+${row.lateMinutes}m late` : style.label;
                return (
                  <tr key={row.staffId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3.5 py-2.5 font-medium text-slate-900">{row.staffName}</td>
                    <td className="tabular px-3.5 py-2.5 text-slate-600">
                      {row.checkInAt ? formatTime(row.checkInAt) : "—"}
                    </td>
                    <td className="tabular px-3.5 py-2.5 text-slate-600">
                      {row.checkOutAt ? formatTime(row.checkOutAt) : "—"}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: style.fill, color: style.fg }}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {!row.checkInAt ? (
                        <button
                          type="button"
                          disabled={busyId === row.staffId}
                          onClick={() => void punch(row.staffId, "in")}
                          className="min-h-9 rounded bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                        >
                          {busyId === row.staffId ? "…" : "Check in"}
                        </button>
                      ) : !row.checkOutAt && row.status !== "MISSING_CHECK_OUT" ? (
                        <button
                          type="button"
                          disabled={busyId === row.staffId}
                          onClick={() => void punch(row.staffId, "out")}
                          className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {busyId === row.staffId ? "…" : "Check out"}
                        </button>
                      ) : row.status === "MISSING_CHECK_OUT" ? (
                        <span className="text-xs text-slate-400">Awaiting their correction</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3.5 py-3">
      <p className="tabular text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
