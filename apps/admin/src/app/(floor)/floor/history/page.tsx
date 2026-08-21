"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchMyAttendance, type AttendanceDayView, type AttendanceStaffSummary } from "../../../../lib/api-client";
import { attendanceStatusStyle, todayLocalDate, WEEKDAY_NAMES } from "../../../../lib/format";

const RANGE_DAYS = 29;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export default function FloorHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<AttendanceDayView[]>([]);
  const [summary, setSummary] = useState<AttendanceStaffSummary | null>(null);

  useEffect(() => {
    fetchMyAttendance({ from: daysAgo(RANGE_DAYS), to: todayLocalDate() })
      .then((report) => {
        setDays([...report.days].sort((a, b) => (a.workDate < b.workDate ? 1 : -1)));
        setSummary(report.summary[0] ?? null);
      })
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <h1 className="text-lg font-bold text-slate-900">My attendance</h1>

      {summary ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat value={summary.presentDays} label="Present" />
          <Stat value={summary.lateDays} label="Late" tone={summary.lateDays > 0 ? "amber" : undefined} />
          <Stat value={summary.absentDays} label="Absent" tone={summary.absentDays > 0 ? "dark" : undefined} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {days.map((row) => (
          <DayRow key={row.workDate} row={row} />
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "amber" | "dark" }) {
  const color = tone === "amber" ? "#92400E" : tone === "dark" ? "#334155" : "#0F172A";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="tabular text-xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function DayRow({ row }: { row: AttendanceDayView }) {
  const style = attendanceStatusStyle(row.status);
  const date = new Date(`${row.workDate}T00:00:00`);
  return (
    <Link
      href={`/floor/requests/new?date=${row.workDate}`}
      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-slate-900">
          {WEEKDAY_NAMES[(date.getDay() + 6) % 7]}, {date.getDate()}{" "}
          {date.toLocaleDateString("en-LK", { month: "short" })}
        </p>
        <p className="tabular text-xs text-slate-500">
          {row.checkInAt
            ? `${new Date(row.checkInAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}${
                row.checkOutAt
                  ? ` – ${new Date(row.checkOutAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}`
                  : " – …"
              }`
            : "—"}
        </p>
      </div>
      <span
        className="shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold"
        style={{ backgroundColor: style.fill, color: style.fg }}
      >
        {row.lateMinutes > 0 ? `+${row.lateMinutes}m late` : style.label}
      </span>
    </Link>
  );
}
