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
import { formatDate, formatPriceCents, formatTime, todayLocalDate } from "../../../lib/format";
import { TOUR_ANCHORS } from "../../../lib/tour-anchors";

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
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Defaults to today, not unbounded — opening this page used to load every
  // appointment ever made, 25 at a time. The date input stays fully editable
  // for anyone who wants a different (or every) day.
  const [date, setDate] = useState(() => todayLocalDate());
  const [status, setStatus] = useState("");
  const [staffId, setStaffId] = useState("");
  const [offset, setOffset] = useState(0);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAppointmentId, setOpenAppointmentId] = useState<string | null>(null);

  // Debounced for the same reason the customer list is: a receptionist looking
  // up "0771…" while somebody waits at the desk types it one digit at a time,
  // and a request per keystroke helps nobody. Changing the search resets to the
  // first page — keeping the offset would show "51-75 of 3", an empty table for
  // a query that has matches.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAppointments({
      q: debounced || undefined,
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
  }, [debounced, date, status, staffId, offset]);

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
            ? "Today's bookings by default — filterable by day, status and staff."
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
      <input
        data-testid="appointment-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Reference, name or phone…"
        aria-label="Search appointments"
        className="min-h-11 w-full max-w-md rounded border border-slate-300 px-3 text-sm"
      />

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
        {query || date !== todayLocalDate() || status || staffId ? (
          <button
            type="button"
            data-testid="appointment-clear-filters"
            onClick={() => {
              setQuery("");
              // Back to the default view (today), not back to unbounded —
              // "Clear" undoes a filter, it doesn't reintroduce loading every
              // appointment ever made.
              setDate(todayLocalDate());
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
            debounced
              ? `Nothing matches "${debounced}".`
              : date !== todayLocalDate() || status || staffId
                ? "No appointments match those filters."
                : "Nothing booked today yet."
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
                    data-tour-id={TOUR_ANCHORS.appointments.openRowButton}
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
