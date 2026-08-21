"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attendanceCheckIn,
  attendanceCheckOut,
  fetchMyAttendance,
  fetchStaff,
  requestAttendanceEdit,
  type AttendanceDayView,
  type StaffMember,
} from "../../../lib/api-client";
import { errorCopy } from "../../../lib/error-copy";
import {
  attendanceStatusStyle,
  formatClockFromMinutes,
  formatMinutesDuration,
  todayLocalDate,
  WEEKDAY_NAMES,
} from "../../../lib/format";
import { useToast } from "../../../components/toast";
import { BusyLabel } from "../../../components/spinner";

const HISTORY_DAYS = 13;

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Fixed picks for the missing-check-out card — the three times a shift most often actually ends. */
const QUICK_CHECKOUT_MIN = [1080, 1110, 1140]; // 6:00, 6:30, 7:00 PM

export default function FloorTodayPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<AttendanceDayView[]>([]);
  const [staff, setStaff] = useState<StaffMember | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchMyAttendance({ from: daysAgo(HISTORY_DAYS), to: todayLocalDate() }),
      fetchStaff(),
    ])
      .then(([report, staffList]) => {
        setDays(report.days);
        const mine = report.days[0];
        setStaff(staffList.find((s) => s.id === mine?.staffId) ?? null);
      })
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const today = todayLocalDate();
  const todayRow = days.find((d) => d.workDate === today) ?? null;
  // At most one shift is ever left open, but sort defensively — the most
  // recent one is the one worth surfacing first.
  const missingRow = useMemo(
    () =>
      [...days]
        .filter((d) => d.status === "MISSING_CHECK_OUT")
        .sort((a, b) => (a.workDate < b.workDate ? 1 : -1))[0] ?? null,
    [days],
  );

  async function doCheckIn(): Promise<void> {
    setBusy(true);
    try {
      await attendanceCheckIn();
      toast.success("Checked in");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  async function doCheckOut(): Promise<void> {
    setBusy(true);
    try {
      await attendanceCheckOut();
      toast.success("Checked out");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  async function quickCorrect(workDate: string, min: number): Promise<void> {
    setBusy(true);
    try {
      const at = new Date(`${workDate}T00:00:00`);
      at.setMinutes(min);
      await requestAttendanceEdit({
        workDate,
        requestedCheckOutAt: at.toISOString(),
        reason: "Forgot to check out — confirmed the time from the quick picker.",
      });
      toast.success("Sent to your manager", "You'll see the outcome under Requests.");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <TodaySkeleton />;
  }

  const initial = staff?.name?.trim()?.[0]?.toUpperCase() ?? "•";

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="mb-1 flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
          style={{ backgroundColor: staff?.color ?? "#0d9488" }}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold text-slate-900">{staff?.name ?? "You"}</p>
          {staff?.specialties ? (
            <p className="truncate text-xs text-slate-500">{staff.specialties}</p>
          ) : null}
        </div>
      </div>

      {missingRow ? (
        <MissingCheckoutCard row={missingRow} busy={busy} onQuickPick={quickCorrect} />
      ) : null}

      <TodayCard row={todayRow} busy={busy} compact={Boolean(missingRow)} onCheckIn={doCheckIn} onCheckOut={doCheckOut} />

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">This week</p>
        <div className="flex flex-col gap-2">
          {days
            .filter((d) => d.workDate !== today)
            .slice(0, 6)
            .map((d) => (
              <HistoryRow key={d.workDate} row={d} />
            ))}
        </div>
      </div>
    </div>
  );
}

function TodayCard({
  row,
  busy,
  compact,
  onCheckIn,
  onCheckOut,
}: {
  row: AttendanceDayView | null;
  busy: boolean;
  compact: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  const checkedIn = row?.checkInAt && !row.checkOutAt;
  const doneToday = row?.checkInAt && row?.checkOutAt;

  if (checkedIn && row) {
    const worked = Math.max(0, Math.round((Date.now() - new Date(row.checkInAt!).getTime()) / 60_000));
    return (
      <div className="rounded-[20px] border border-slate-200 bg-white p-6">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Checked in
        </p>
        <p className="tabular mt-1.5 text-[40px] font-bold leading-none tracking-tight text-slate-900">
          {formatMinutesDuration(worked)}
        </p>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          Since {new Date(row.checkInAt!).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}
          {row.expectedEndMin !== null ? ` · shift ends ${formatClockFromMinutes(row.expectedEndMin)}` : ""}
        </p>
        <button
          type="button"
          onClick={onCheckOut}
          disabled={busy}
          className="mt-3.5 min-h-[52px] w-full rounded-2xl bg-slate-100 text-[15px] font-bold text-slate-900 disabled:opacity-60"
        >
          <BusyLabel busy={busy} busyText="Checking out…">
            Check out
          </BusyLabel>
        </button>
      </div>
    );
  }

  if (doneToday && row) {
    return (
      <div className="rounded-[20px] border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Done for today</p>
        <p className="mt-1 text-[15px] font-semibold text-slate-900">
          {new Date(row.checkInAt!).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })} –{" "}
          {new Date(row.checkOutAt!).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}
          {row.workedMinutes !== null ? ` · ${formatMinutesDuration(row.workedMinutes)}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[20px] p-6 text-white ${compact ? "py-4" : ""}`}
      style={{ background: "linear-gradient(155deg, #0d9488 0%, #0f766e 100%)" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-teal-100">Not checked in</p>
      {!compact ? (
        <>
          <p className="mt-1.5 text-2xl font-bold leading-tight tracking-tight">
            {greeting()}
          </p>
          <p className="mt-1 text-[13.5px] text-teal-50">
            {row?.expectedStartMin !== null && row?.expectedStartMin !== undefined
              ? `Shift today ${formatClockFromMinutes(row.expectedStartMin)}${
                  row.expectedEndMin !== null ? ` – ${formatClockFromMinutes(row.expectedEndMin)}` : ""
                }`
              : shiftContext(row)}
          </p>
        </>
      ) : null}
      <button
        type="button"
        onClick={onCheckIn}
        disabled={busy}
        className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-bold text-teal-800 disabled:opacity-70 ${compact ? "mt-3" : "mt-3.5"}`}
      >
        <BusyLabel busy={busy} busyText="Checking in…">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8.5l3.2 3.2L13 4.5" />
            </svg>
            Check in
          </span>
        </BusyLabel>
      </button>
    </div>
  );
}

function shiftContext(row: AttendanceDayView | null): string {
  switch (row?.status) {
    case "ON_LEAVE":
      return "You're on approved leave today";
    case "CLOSED":
      return "The salon is closed today";
    case "DAY_OFF":
      return "You're not rostered today";
    default:
      return "Ready when you are";
  }
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function MissingCheckoutCard({
  row,
  busy,
  onQuickPick,
}: {
  row: AttendanceDayView;
  busy: boolean;
  onQuickPick: (workDate: string, min: number) => void;
}) {
  return (
    <div className="rounded-[18px] border border-orange-300 bg-orange-50 p-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">Missing check-out</p>
      <p className="mt-1 text-[17px] font-bold leading-snug text-slate-900">
        You didn&apos;t check out {relativeDay(row.workDate)}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        Checked in {relativeDay(row.workDate)} at{" "}
        {new Date(row.checkInAt!).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}. About what
        time did you actually leave?
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {QUICK_CHECKOUT_MIN.map((min) => (
          <button
            key={min}
            type="button"
            disabled={busy}
            onClick={() => onQuickPick(row.workDate, min)}
            className="min-h-11 rounded-xl border border-orange-300 bg-white text-[13px] font-bold text-orange-800 disabled:opacity-60"
          >
            {formatClockFromMinutes(min)}
          </button>
        ))}
      </div>
      <Link
        href={`/floor/requests/new?date=${row.workDate}`}
        className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-300 bg-white text-[13.5px] font-bold text-orange-700"
      >
        Different time…
      </Link>
    </div>
  );
}

function HistoryRow({ row }: { row: AttendanceDayView }) {
  const style = attendanceStatusStyle(row.status);
  const date = new Date(`${row.workDate}T00:00:00`);
  return (
    <Link
      href={`/floor/requests/new?date=${row.workDate}`}
      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
    >
      <span className="w-14 shrink-0 text-[13.5px] font-semibold text-slate-900">
        {WEEKDAY_NAMES[(date.getDay() + 6) % 7].slice(0, 3)}
      </span>
      <span className="tabular flex-1 truncate text-xs text-slate-500">
        {row.checkInAt
          ? `${new Date(row.checkInAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}${
              row.checkOutAt
                ? ` – ${new Date(row.checkOutAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}`
                : " – …"
            }`
          : "—"}
      </span>
      <span
        className="shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold"
        style={{ backgroundColor: style.fill, color: style.fg }}
      >
        {row.lateMinutes > 0 ? `+${row.lateMinutes}m late` : style.label}
      </span>
    </Link>
  );
}

function relativeDay(workDate: string): string {
  if (workDate === todayLocalDate()) return "today";
  if (workDate === daysAgo(1)) return "yesterday";
  const date = new Date(`${workDate}T00:00:00`);
  return `on ${WEEKDAY_NAMES[(date.getDay() + 6) % 7]}`;
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="skeleton h-11 w-40 rounded-full" />
      <div className="skeleton h-44 rounded-[20px]" />
      <div className="skeleton h-16 rounded-xl" />
      <div className="skeleton h-16 rounded-xl" />
    </div>
  );
}
