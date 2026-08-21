"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAppointments,
  fetchStaff,
  type AppointmentRecord,
  type ListMeta,
  type StaffMember,
} from "../../../lib/api-client";
import { canManageAppointments } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../components/data-table";
import { Pager } from "../../../components/pager";
import { StatusBadge } from "../../../components/status-badge";
import { AppointmentDetailDrawer } from "../../../components/appointment-detail-drawer";
import { InquiriesPanel } from "../../../components/inquiries-panel";
import { formatDate, formatPriceCents, formatTime } from "../../../lib/format";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SERVICE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
  "RESCHEDULED",
] as const;

/**
 * Bookings and inquiries share this screen because a receptionist is already
 * here, and the nav already carries eleven destinations. They stay separate
 * tabs rather than one merged list: an inquiry holds no slot and has no time,
 * so sorting it into a booking table would mean inventing a column it can
 * never fill.
 */
type Tab = "BOOKINGS" | "INQUIRIES";

export default function AppointmentsPage() {
  const { user } = useAuth();
  const canManage = canManageAppointments(user?.roles ?? []);
  const [tab, setTab] = useState<Tab>("BOOKINGS");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const [offset, setOffset] = useState(0);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAppointments({
      date: date || undefined,
      status: status || undefined,
      staffId: staffId || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((res) => {
        setAppointments(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load appointments.");
      })
      .finally(() => setLoading(false));
  }, [date, status, staffId, offset]);

  useEffect(load, [load]);
  useEffect(() => {
    void fetchStaff().then(setStaff);
  }, []);

  function resetOffset(): void {
    setOffset(0);
  }

  // The sidebar already hides this destination from STAFF, but hiding is
  // convenience only — someone with the URL still lands here, and every other
  // screen says so plainly rather than rendering an empty table.
  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Appointments</h1>
        </div>
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          The full appointment book is not part of your role. Your own day is on Today.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Appointments</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {tab === "BOOKINGS"
            ? "Every booking, filterable by day, status and staff."
            : "Questions people asked that have not become bookings."}
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Appointments view">
        {(
          [
            { value: "BOOKINGS", label: "Bookings" },
            { value: "INQUIRIES", label: "Inquiries" },
          ] as Array<{ value: Tab; label: string }>
        ).map((option) => {
          const active = tab === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`appointments-tab-${option.value}`}
              onClick={() => setTab(option.value)}
              className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium transition-colors ${
                active
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "INQUIRIES" ? (
        <InquiriesPanel />
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        <input
          data-testid="appointment-date-filter"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            resetOffset();
          }}
          aria-label="Filter by date"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />
        <select
          data-testid="appointment-status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetOffset();
          }}
          aria-label="Filter by status"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/^\w/, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <select
          data-testid="appointment-staff-filter"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            resetOffset();
          }}
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
        {date || status || staffId ? (
          <button
            type="button"
            data-testid="appointment-clear-filters"
            onClick={() => {
              setDate("");
              setStatus("");
              setStaffId("");
              resetOffset();
            }}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : appointments.length === 0 ? (
        <EmptyState
          title={
            date || status || staffId
              ? "No appointments match those filters."
              : "No appointments yet — they appear here the moment someone books."
          }
        />
      ) : (
        <>
          <DataTable
            caption="Appointments"
            columns={[
              { label: "When" },
              { label: "Customer" },
              { label: "Reference" },
              { label: "Status" },
              { label: "Total", align: "right" },
              { label: "Owing", align: "right" },
            ]}
          >
            {appointments.map((appointment) => (
              <Row key={appointment.id} testId={`appointment-row-${appointment.id}`}>
                <Cell>
                  <button
                    type="button"
                    data-testid={`appointment-link-${appointment.id}`}
                    onClick={() => setOpenAppointmentId(appointment.id)}
                    className="text-left font-medium text-teal-700 hover:underline"
                  >
                    <span className="block tabular">{formatDate(appointment.startTime)}</span>
                    <span className="block text-xs text-slate-500 tabular">
                      {formatTime(appointment.startTime)}
                    </span>
                  </button>
                </Cell>
                <Cell>
                  {appointment.customer ? (
                    <span className="text-slate-800">
                      {appointment.customer.firstName} {appointment.customer.lastName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell>
                  <span className="text-xs text-slate-600 tabular">
                    {appointment.bookingReference}
                  </span>
                </Cell>
                <Cell>
                  <StatusBadge status={appointment.status} />
                </Cell>
                <Cell align="right">{formatPriceCents(appointment.totalCents)}</Cell>
                <Cell align="right">
                  {appointment.balanceCents > 0 ? (
                    <span className="font-medium text-amber-800">
                      {formatPriceCents(appointment.balanceCents)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Settled</span>
                  )}
                </Cell>
              </Row>
            ))}
          </DataTable>
          {meta ? (
            <Pager
              total={meta.total}
              limit={meta.limit}
              offset={meta.offset}
              onOffsetChange={setOffset}
              unit="appointment"
              busy={loading}
            />
          ) : null}
        </>
      )}

        </>
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
