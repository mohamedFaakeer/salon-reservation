"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchAttendanceReport,
  fetchStaff,
  type AttendanceReport,
  type StaffMember,
} from "../../../../lib/api-client";
import { ModuleGate } from "../../../../components/module-gate";
import { TableSkeleton } from "../../../../components/loading-skeleton";
import { EmptyState } from "../../../../components/empty-state";
import { AttendanceReportGrid } from "../../../../components/attendance-report-grid";
import { DateRangePicker, presetRanges, type DateRange } from "../../../../components/date-range-picker";

export default function AttendanceReportPageGated() {
  return (
    <ModuleGate module="attendance" label="Attendance">
      <AttendanceReportPage />
    </ModuleGate>
  );
}

/**
 * Every stylist, every day in the chosen range — "worked / late / absent /
 * on leave / not scheduled" at a glance, not just today's punch board.
 * `GET /attendance` already computes this whole grid server-side
 * (`AttendanceService.buildReport`, cross-referencing the punch against the
 * rota, leave and closures) — this page only renders it.
 */
function AttendanceReportPage() {
  const [range, setRange] = useState<DateRange>(
    () => presetRanges().find((p) => p.id === "week")?.range ?? presetRanges()[0].range,
  );
  const [staffId, setStaffId] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchAttendanceReport({ from: range.from, to: range.to, staffId: staffId || undefined })
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [range, staffId]);

  useEffect(load, [load]);
  useEffect(() => {
    void fetchStaff().then(setStaff);
  }, []);

  const totals = report?.summary.reduce(
    (acc, s) => ({
      present: acc.present + s.presentDays,
      late: acc.late + s.lateDays,
      absent: acc.absent + s.absentDays,
      missing: acc.missing + s.missingCheckOutDays,
      leave: acc.leave + s.leaveDays,
    }),
    { present: 0, late: 0, absent: 0, missing: 0, leave: 0 },
  ) ?? { present: 0, late: 0, absent: 0, missing: 0, leave: 0 };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Attendance report</h1>
          <p className="text-sm text-slate-500">Every stylist, every day — worked, late, absent, on leave or not scheduled.</p>
        </div>
        <Link href="/attendance" className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to board
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <select
          data-testid="attendance-report-staff-filter"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          aria-label="Filter by staff"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        >
          <option value="">All staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : !report || report.summary.length === 0 ? (
        <EmptyState title="No staff to show for this range." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat value={totals.present} label="Present days" />
            <Stat value={totals.late} label="Late arrivals" tone={totals.late > 0 ? "#92400E" : undefined} />
            <Stat value={totals.absent} label="Absent days" tone={totals.absent > 0 ? "#334155" : undefined} />
            <Stat value={totals.missing} label="Missing check-out" tone={totals.missing > 0 ? "#9A3412" : undefined} />
            <Stat value={totals.leave} label="On leave days" tone={totals.leave > 0 ? "#155E75" : undefined} />
          </div>
          <AttendanceReportGrid report={report} staff={staff} />
        </>
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

