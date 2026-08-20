"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAppointments,
  fetchStaff,
  type AppointmentRecord,
  type StaffMember,
} from "../../../lib/api-client";
import { canViewDashboard } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { CalendarSkeleton, ListSkeleton } from "../../../components/loading-skeleton";
import { DayCalendar } from "../../../components/day-calendar";
import { AppointmentDetailDrawer } from "../../../components/appointment-detail-drawer";
import { BookingDrawer } from "../../../components/booking-drawer";
import { todayLocalDate } from "../../../lib/format";

/**
 * Schedule — the day board for any date, not just today.
 *
 * Today is the live view; this is the planning view. The same DayCalendar
 * renders both, so a receptionist checking tomorrow's board sees exactly what
 * they'll see when tomorrow becomes today.
 */
export default function SchedulePage() {
  const { user } = useAuth();
  const canBook = canViewDashboard(user?.roles ?? []);
  const [date, setDate] = useState(todayLocalDate());
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);
  const [showBookingDrawer, setShowBookingDrawer] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAppointments({ date, limit: 100 })
      .then((res) => setAppointments(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load appointments.");
      })
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    load();
    void fetchStaff().then(setStaff);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Schedule</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            The day board for any date — plan ahead or look back.
          </p>
        </div>
        {canBook ? (
          <button
            type="button"
            data-testid="schedule-new-booking"
            onClick={() => setShowBookingDrawer(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            New booking
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          data-testid="schedule-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Pick a date"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />
        <button
          type="button"
          data-testid="schedule-today"
          onClick={() => setDate(todayLocalDate())}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Today
        </button>
      </div>

      {loading ? (
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
      ) : appointments.length === 0 ? (
        <EmptyState
          title={`No appointments on ${date}.`}
          action={
            canBook
              ? { label: "New booking", onClick: () => setShowBookingDrawer(true) }
              : undefined
          }
        />
      ) : (
        <div className="hidden lg:block">
          <DayCalendar appointments={appointments} staff={staff} onSelect={setOpenAppointmentId} />
        </div>
      )}

      {showBookingDrawer ? (
        <BookingDrawer
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
