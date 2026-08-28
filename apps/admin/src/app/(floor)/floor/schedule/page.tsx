"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAppointments, type AppointmentRecord } from "../../../../lib/api-client";
import { formatTime, todayLocalDate } from "../../../../lib/format";
import { EmptyState } from "../../../../components/empty-state";
import { StatusBadge } from "../../../../components/status-badge";
import { AppointmentDetailDrawer } from "../../../../components/appointment-detail-drawer";

/**
 * A stylist's own appointments for today. The list endpoint already scopes
 * to the caller's own staffId for a STAFF-only login (server-side, not a
 * client filter — CLAUDE.md), so this is a plain read; every action inside
 * the detail drawer (start service, complete, and the "ask the front desk"
 * message for a wrong-dated appointment) is the exact same component the
 * desk uses, not a second implementation.
 */
export default function FloorSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchAppointments({ date: todayLocalDate() })
      .then((res) => setAppointments(res.data))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const sorted = [...appointments].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex flex-col gap-4 pt-1">
      <h1 className="text-lg font-bold text-slate-900">My schedule</h1>

      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState title="Nothing booked for you today." />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((appt) => (
            <button
              key={appt.id}
              type="button"
              data-testid={`floor-schedule-appointment-${appt.id}`}
              onClick={() => setOpenAppointmentId(appt.id)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-teal-400"
            >
              <div className="min-w-0">
                <p className="tabular text-[13.5px] font-semibold text-slate-900">
                  {formatTime(appt.startTime)}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}` : "Customer"}
                </p>
              </div>
              <StatusBadge status={appt.status} />
            </button>
          ))}
        </div>
      )}

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
