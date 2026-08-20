"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ApiRequestError,
  fetchCustomer,
  fetchCustomerAppointments,
  fetchCustomerStats,
  type AppointmentRecord,
  type CustomerDetail,
  type CustomerStats,
  type ListMeta,
} from "../../../../lib/api-client";
import { canManageCustomers } from "../../../../lib/permissions";
import { useAuth } from "../../../../context/auth-context";
import { EmptyState } from "../../../../components/empty-state";
import { ListSkeleton } from "../../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../../components/data-table";
import { StatusBadge } from "../../../../components/status-badge";
import { Pager } from "../../../../components/pager";
import { formatDate, formatPhone, formatPriceCents, formatTime } from "../../../../lib/format";

/**
 * One customer, and everything they have booked.
 *
 * The history is the ordinary appointment list filtered server-side by
 * customer, not a separate query — so it stays consistent with the day board
 * and keeps STAFF scoped to their own appointments here exactly as elsewhere.
 *
 * The no-show count is its own filtered request rather than a tally of the
 * page on screen. Counting the visible rows would report "0 no-shows" for a
 * customer with three of them on page two, which is worse than not saying.
 */

const PAGE_SIZE = 20;

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { user } = useAuth();
  const canManage = canManageCustomers(user?.roles ?? []);

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCustomer(customerId),
      fetchCustomerAppointments(customerId, { limit: PAGE_SIZE, offset }),
      fetchCustomerStats(customerId),
    ])
      .then(([customerRow, history, customerStats]) => {
        setCustomer(customerRow);
        setAppointments(history.data);
        setMeta(history.meta);
        setStats(customerStats);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load this customer.");
      })
      .finally(() => setLoading(false));
  }, [customerId, offset]);

  useEffect(load, [load]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Customer records are not part of your role. Ask a receptionist or manager.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      </div>
    );
  }

  if (loading || !customer) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ListSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {customer.firstName} {customer.lastName}
        </h1>

        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Phone" value={formatPhone(customer.phone)} tabular />
          <Fact label="Email" value={customer.email ?? "Not given"} />
          <Fact label="Customer since" value={formatDate(customer.createdAt)} tabular />
          <Fact
            label="Last visit"
            value={stats?.lastVisitDate ? formatDate(stats.lastVisitDate) : "Not yet"}
            tabular
          />
        </dl>

        {customer.notes ? (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{customer.notes}</p>
          </div>
        ) : null}
      </div>

      {stats ? <CustomerHistory stats={stats} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Booking history</h2>

        {appointments.length === 0 ? (
          <EmptyState title="No bookings on record for this customer." />
        ) : (
          <>
            <DataTable
              caption={`Bookings for ${customer.firstName} ${customer.lastName}`}
              columns={[
                { label: "When" },
                { label: "Reference" },
                { label: "Status" },
                { label: "Total", align: "right" },
                { label: "Owing", align: "right" },
              ]}
            >
              {appointments.map((appointment) => (
                <Row key={appointment.id} testId={`history-row-${appointment.id}`}>
                  <Cell>
                    <span className="font-medium text-slate-900 tabular">
                      {formatDate(appointment.startTime)}
                    </span>
                    <span className="block text-xs text-slate-500 tabular">
                      {formatTime(appointment.startTime)}
                    </span>
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
                unit="booking"
                busy={loading}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What this customer is worth, and how reliable they are.
 *
 * Every number is aggregated server-side over their whole history, not over
 * the page of bookings below — those are different questions, and answering
 * the first with the second is how a customer with three no-shows on page two
 * reads as spotless.
 */
function CustomerHistory({ stats }: { stats: CustomerStats }) {
  const risky = stats.noShowRate !== null && stats.noShowRate >= 25;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">History at this salon</h2>

      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Visits" value={String(stats.visits)} tabular />
        <Fact label="Total spent" value={formatPriceCents(stats.totalSpentCents)} tabular />
        <Fact
          label="Cancelled"
          value={String(stats.cancellations)}
          tabular
        />
        <Fact
          label="No-shows"
          value={String(stats.noShows)}
          tabular
          note={
            /* A rate only means something once something has concluded, and
               only worth flagging when it is bad enough to change how you
               treat the booking. */
            risky ? `${stats.noShowRate}% of concluded bookings` : undefined
          }
        />
      </dl>

      {stats.services.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
            What they book
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {stats.services.map((service) => (
              <li
                key={service.name}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
              >
                {service.name}
                <span className="ml-1 font-semibold tabular">×{service.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.totalBookings === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No bookings yet — this customer was added but has never been in.
        </p>
      ) : null}
    </section>
  );
}

function Fact({
  label,
  value,
  note,
  tabular = false,
}: {
  label: string;
  value: string;
  note?: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">
        {label}
      </dt>
      <dd className={`text-sm text-slate-800 ${tabular ? "tabular" : ""}`}>{value}</dd>
      {note ? <p className="text-xs font-medium text-amber-800">{note}</p> : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/customers"
      data-testid="back-to-customers"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" focusable="false">
        <path
          d="M9.5 3.5 5 8l4.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      All customers
    </Link>
  );
}
