"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";
import {
  ApiRequestError,
  checkIn,
  complete,
  fetchAppointment,
  fetchTenantSettings,
  inService,
  type AppointmentDetail,
} from "../lib/api-client";
import { canActOnOwnAppointment, canManageAppointments } from "../lib/permissions";
import { formatDurationMin, formatPriceCents, formatTime } from "../lib/format";
import { LoadingSkeleton } from "./loading-skeleton";

export function AppointmentDetailDrawer({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [graceMinutes, setGraceMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  function load(): void {
    setLoading(true);
    void fetchAppointment(appointmentId)
      .then(setAppointment)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    void fetchTenantSettings().then((s) => setGraceMinutes(s.noShowGraceMinutes ?? 0));
  }, [appointmentId]);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActing(true);
    setActionError(null);
    try {
      await action();
      load();
      onChanged();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : "Could not update this appointment.");
    } finally {
      setActing(false);
    }
  }

  const roles = user?.roles ?? [];
  const isLate = Boolean(appointment?.checkedInAt) && (appointment?.lateMinutes ?? 0) > graceMinutes;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Appointment</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {loading || !appointment ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {appointment.customer.firstName} {appointment.customer.lastName}
              </p>
              <p className="text-slate-500">{appointment.customer.phone}</p>
            </div>

            {isLate ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm font-medium text-amber-800">
                LATE — {appointment.lateMinutes} minutes
              </div>
            ) : null}

            <div className="text-sm">
              <p className="text-slate-500">
                {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)} with{" "}
                {appointment.staff.name}
              </p>
              <p data-testid="detail-status" className="mt-1 font-semibold text-slate-900">
                {appointment.status}
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Services</p>
              <ul className="text-sm text-slate-600">
                {appointment.lines.map((line) => (
                  <li key={line.id}>
                    {line.nameSnapshot} ({formatDurationMin(line.durationMinSnapshot)}) —{" "}
                    {formatPriceCents(line.priceCentsSnapshot)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-semibold text-slate-900">{formatPriceCents(appointment.totalCents)}</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Timeline</p>
              <ul className="text-xs text-slate-500">
                <li>Created</li>
                {appointment.checkedInAt ? <li>Checked in — {formatTime(appointment.checkedInAt)}</li> : null}
                {appointment.inServiceAt ? <li>In service — {formatTime(appointment.inServiceAt)}</li> : null}
                {appointment.completedAt ? <li>Completed — {formatTime(appointment.completedAt)}</li> : null}
              </ul>
            </div>

            {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

            <div className="flex flex-col gap-2">
              {appointment.status === "CONFIRMED" && canManageAppointments(roles) ? (
                <button
                  type="button"
                  data-testid="action-check-in"
                  disabled={acting}
                  onClick={() => void runAction(() => checkIn(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Check in
                </button>
              ) : null}
              {appointment.status === "CHECKED_IN" &&
              (canManageAppointments(roles) || canActOnOwnAppointment(roles)) ? (
                <button
                  type="button"
                  data-testid="action-in-service"
                  disabled={acting}
                  onClick={() => void runAction(() => inService(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Start service
                </button>
              ) : null}
              {(appointment.status === "CHECKED_IN" || appointment.status === "IN_SERVICE") &&
              (canManageAppointments(roles) || canActOnOwnAppointment(roles)) ? (
                <button
                  type="button"
                  data-testid="action-complete"
                  disabled={acting}
                  onClick={() => void runAction(() => complete(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Complete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
