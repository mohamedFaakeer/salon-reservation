"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAppointments,
  fetchStaff,
  type AppointmentRecord,
  type StaffMember,
} from "../../../lib/api-client";
import { formatPriceCents, formatTime, todayLocalDate } from "../../../lib/format";
import { canManageAppointments } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { BookingDrawer } from "../../../components/booking-drawer";
import { AppointmentDetailDrawer } from "../../../components/appointment-detail-drawer";

export default function TodayPage() {
  const { user } = useAuth();
  const canBook = canManageAppointments(user?.roles ?? []);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBookingDrawer, setShowBookingDrawer] = useState(false);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAppointments(todayLocalDate())
      .then((res) => setAppointments(res.data))
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load today's appointments.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    void fetchStaff().then(setStaff);
  }, [load]);

  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  const byStaff = new Map<string, AppointmentRecord[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staffId) ?? [];
    list.push(appt);
    byStaff.set(appt.staffId, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Today — {todayLocalDate()}</h1>
        {canBook ? (
          <button
            type="button"
            data-testid="new-booking-button"
            onClick={() => setShowBookingDrawer(true)}
            className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            New booking
          </button>
        ) : null}
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <EmptyState title={error} action={{ label: "Retry", onClick: load }} />
      ) : appointments.length === 0 ? (
        <EmptyState
          title="No appointments today — here's what's next"
          action={canBook ? { label: "New booking", onClick: () => setShowBookingDrawer(true) } : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from(byStaff.entries()).map(([staffId, list]) => (
            <div key={staffId} data-testid={`staff-group-${staffId}`} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-slate-500">{staffNameById.get(staffId) ?? "Staff"}</p>
              <ul className="flex flex-col gap-2">
                {list
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((appt) => (
                    <li key={appt.id}>
                      <button
                        type="button"
                        data-testid={`appointment-card-${appt.id}`}
                        onClick={() => setOpenAppointmentId(appt.id)}
                        className="flex w-full items-center justify-between rounded border border-slate-200 p-3 text-left text-sm hover:border-teal-400"
                      >
                        <span>
                          <span className="font-medium text-slate-900">{formatTime(appt.startTime)}</span>{" "}
                          <span className="text-slate-500">· {appt.bookingReference}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-500">{formatPriceCents(appt.totalCents)}</span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {appt.status}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
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
