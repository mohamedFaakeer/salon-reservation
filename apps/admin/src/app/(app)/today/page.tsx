"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAppointments,
  fetchDashboard,
  fetchStaff,
  type AppointmentRecord,
  type DashboardSummary,
  type StaffMember,
} from "../../../lib/api-client";
import { formatDate, formatPriceCents, formatTime, todayLocalDate } from "../../../lib/format";
import { canManageAppointments } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import {
  CalendarSkeleton,
  ListSkeleton,
  StatsSkeleton,
} from "../../../components/loading-skeleton";
import { BookingDrawer } from "../../../components/booking-drawer";
import { AppointmentDetailDrawer } from "../../../components/appointment-detail-drawer";
import { DashboardStats } from "../../../components/dashboard-stats";
import { StatusBadge } from "../../../components/status-badge";
import { DayCalendar } from "../../../components/day-calendar";
import {
  DateRangePicker,
  presetRanges,
  type DateRange,
} from "../../../components/date-range-picker";

export default function TodayPage() {
  const { user } = useAuth();
  const canBook = canManageAppointments(user?.roles ?? []);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState<DashboardSummary | null>(null);
  // Defaults to today, so the screen opens as the day board it replaces.
  const [range, setRange] = useState<DateRange>(() => presetRanges()[0].range);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookingDrawer, setShowBookingDrawer] = useState(false);
  const [walkInDefault, setWalkInDefault] = useState(false);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);

  const singleDay = range.from === range.to;

  const load = useCallback(() => {
    if (range.to < range.from) {
      return;
    }
    setLoading(true);
    setError(null);
    // The appointment list is only fetched for a single day. A month of
    // bookings is the Appointments screen's job, and pulling them here to
    // render a calendar that only understands one day would be work thrown
    // away.
    const listPromise = singleDay
      ? fetchAppointments({ date: range.from }).then((res) => setAppointments(res.data))
      : Promise.resolve(setAppointments([]));

    listPromise
      .catch((err: unknown) => {
        setError(
          err instanceof ApiRequestError ? err.message : "Could not load these appointments.",
        );
      })
      .finally(() => setLoading(false));

    void fetchDashboard(range)
      .then(setStats)
      .catch(() => setStats(null));
  }, [range, singleDay]);

  useEffect(() => {
    load();
    void fetchStaff().then(setStaff);
  }, [load]);

  function openNewBooking(): void {
    setWalkInDefault(false);
    setShowBookingDrawer(true);
  }

  function openWalkIn(): void {
    setWalkInDefault(true);
    setShowBookingDrawer(true);
  }

  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  const byStaff = new Map<string, AppointmentRecord[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staffId) ?? [];
    list.push(appt);
    byStaff.set(appt.staffId, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {singleDay
              ? range.from === todayLocalDate()
                ? "Today"
                : formatDate(range.from)
              : `${formatDate(range.from)} – ${formatDate(range.to)}`}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {singleDay
              ? "Every appointment on this day, and who is in the salon now."
              : "Totals for the period. Open a single day to see its appointments."}
          </p>
        </div>
        {canBook ? (
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="walk-in-button"
              onClick={openWalkIn}
              className="min-h-11 rounded border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Walk-in
            </button>
            <button
              type="button"
              data-testid="new-booking-button"
              onClick={openNewBooking}
              className="min-h-11 rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              New booking
            </button>
          </div>
        ) : null}
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      {stats ? <DashboardStats stats={stats} /> : loading ? <StatsSkeleton /> : null}

      {loading ? (
        // Mirrors the real responsive split below, so the placeholder occupies
        // the same footprint the content will and nothing shifts on arrival.
        <>
          <div className="hidden lg:block">
            <CalendarSkeleton />
          </div>
          <div className="lg:hidden">
            <ListSkeleton />
          </div>
        </>
      ) : error ? (
        <EmptyState title={error} action={{ label: "Retry", onClick: load }} />
      ) : !singleDay ? (
        // The calendar draws one day. Rather than invent a month view here,
        // say so and point at the screen that does list a range.
        <EmptyState
          title={`${stats?.appointments ?? 0} appointments in this period. Pick a single day to see the diary, or open Appointments to list them all.`}
          action={{ label: "Back to today", onClick: () => setRange(presetRanges()[0].range) }}
        />
      ) : appointments.length === 0 ? (
        <EmptyState
          title={
            range.from === todayLocalDate()
              ? "Nothing booked today yet."
              : `Nothing booked on ${formatDate(range.from)}.`
          }
          action={canBook ? { label: "New booking", onClick: openNewBooking } : undefined}
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <DayCalendar
              appointments={appointments}
              staff={staff}
              onSelect={setOpenAppointmentId}
            />
          </div>
          <div className="flex flex-col gap-4 lg:hidden">
            {Array.from(byStaff.entries()).map(([staffId, list]) => (
              <div
                key={staffId}
                data-testid={`staff-group-${staffId}`}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <p className="mb-2 text-sm font-medium text-slate-500">
                  {staffNameById.get(staffId) ?? "Staff"}
                </p>
                <ul className="flex flex-col gap-2">
                  {list
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((appt, i) => (
                      <li
                        key={appt.id}
                        className="motion-rise"
                        // Capped at 4 steps: a stagger should read as one arrival,
                        // and a fully-booked day must not become a slow cascade.
                        style={{ animationDelay: `${Math.min(i, 4) * 45}ms` }}
                      >
                        <button
                          type="button"
                          data-testid={`appointment-card-${appt.id}`}
                          onClick={() => setOpenAppointmentId(appt.id)}
                          className="flex min-h-11 w-full items-center justify-between rounded border border-slate-200 p-3 text-left text-sm transition-colors hover:border-teal-400"
                        >
                          <span>
                            <span className="font-medium text-slate-900">
                              {formatTime(appt.startTime)}
                            </span>{" "}
                            <span className="text-slate-500">· {appt.bookingReference}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-slate-500">
                              {formatPriceCents(appt.totalCents)}
                            </span>
                            <StatusBadge status={appt.status} />
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {showBookingDrawer ? (
        <BookingDrawer
          defaultCheckInNow={walkInDefault}
          onClose={() => setShowBookingDrawer(false)}
          onCreated={() => {
            setShowBookingDrawer(false);
            load();
          }}
        />
      ) : null}
      {openAppointmentId ? (
        <AppointmentDetailDrawer
          appointmentId={openAppointmentId}
          onClose={() => setOpenAppointmentId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
