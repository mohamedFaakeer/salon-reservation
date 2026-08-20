"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchPaymentsList,
  type ListMeta,
  type PaymentRecord,
} from "../../../lib/api-client";
import { canRecordPayment } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../components/data-table";
import { Pager } from "../../../components/pager";
import { formatDate, formatPriceCents, formatTime } from "../../../lib/format";

/**
 * Payments — every amount taken, and what it was taken against.
 *
 * No total is summed here. A page of twenty-five rows would sum to a figure
 * that looks like the salon's takings and is not, and the honest total already
 * exists on the Today dashboard, computed server-side.
 *
 * REQUIRES_RECONCILIATION is the state worth surfacing: it means the money and
 * the record disagree, which nothing else on this screen would tell you.
 */

const PAGE_SIZE = 25;

const STATES = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "REQUIRES_RECONCILIATION",
] as const;

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD_CAPTURED: "Card",
  ONLINE: "Online",
  GATEWAY: "Gateway",
};

const TYPE_LABELS: Record<string, string> = {
  ADVANCE: "Deposit",
  FULL: "Full",
  BALANCE: "Balance",
};

function humanState(state: string): string {
  return state.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Each branch keeps its own complete class string so text and ground stay paired. */
function StatePill({ state }: { state: string }) {
  if (state === "SUCCESS") {
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        Success
      </span>
    );
  }
  if (state === "REQUIRES_RECONCILIATION") {
    return (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        Needs reconciling
      </span>
    );
  }
  if (state === "REFUNDED" || state === "PARTIALLY_REFUNDED") {
    return (
      <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-900">
        {humanState(state)}
      </span>
    );
  }
  if (state === "FAILED" || state === "EXPIRED") {
    return (
      <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
        {humanState(state)}
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
      {humanState(state)}
    </span>
  );
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const canView = canRecordPayment(user?.roles ?? []);

  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPaymentsList({ state: state || undefined, limit: PAGE_SIZE, offset })
      .then((res) => {
        setPayments(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load payments.");
      })
      .finally(() => setLoading(false));
  }, [state, offset]);

  useEffect(load, [load]);

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Payment records are not part of your role.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Header />

      <div className="flex flex-wrap gap-2">
        <select
          data-testid="payment-state-filter"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setOffset(0);
          }}
          aria-label="Filter by payment state"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {humanState(s)}
            </option>
          ))}
        </select>
        {state ? (
          <button
            type="button"
            data-testid="payment-clear-filter"
            onClick={() => {
              setState("");
              setOffset(0);
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
      ) : payments.length === 0 ? (
        <EmptyState
          title={
            state
              ? `No payments are in the "${humanState(state)}" state.`
              : "No payments recorded yet."
          }
        />
      ) : (
        <>
          <DataTable
            caption="Payments recorded by this salon"
            columns={[
              { label: "When" },
              { label: "Customer" },
              { label: "Booking" },
              { label: "Method" },
              { label: "Kind" },
              { label: "State" },
              { label: "Amount", align: "right" },
            ]}
          >
            {payments.map((payment) => (
              <Row key={payment.id} testId={`payment-row-${payment.id}`}>
                <Cell>
                  <span className="block text-slate-800 tabular">
                    {formatDate(payment.recordedAt ?? payment.createdAt)}
                  </span>
                  <span className="block text-xs text-slate-500 tabular">
                    {formatTime(payment.recordedAt ?? payment.createdAt)}
                  </span>
                </Cell>
                <Cell>
                  {payment.customer ? (
                    <span className="text-slate-800">
                      {payment.customer.firstName} {payment.customer.lastName}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell>
                  {payment.appointment ? (
                    <span className="text-xs text-slate-600 tabular">
                      {payment.appointment.bookingReference}
                    </span>
                  ) : (
                    /* appointmentId is ON DELETE SET NULL, so a payment can
                       outlive its booking. Saying so beats an empty cell. */
                    <span className="text-xs text-slate-400">No booking</span>
                  )}
                </Cell>
                <Cell>
                  <span className="text-slate-700">
                    {METHOD_LABELS[payment.method] ?? payment.method}
                  </span>
                </Cell>
                <Cell>
                  <span className="text-xs text-slate-600">
                    {TYPE_LABELS[payment.type] ?? payment.type}
                  </span>
                </Cell>
                <Cell>
                  <StatePill state={payment.state} />
                </Cell>
                <Cell align="right">{formatPriceCents(payment.amountCents)}</Cell>
              </Row>
            ))}
          </DataTable>

          {meta ? (
            <Pager
              total={meta.total}
              limit={meta.limit}
              offset={meta.offset}
              onOffsetChange={setOffset}
              unit="payment"
              busy={loading}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every amount taken, newest first. Refunds are issued from a booking, not from here.
      </p>
    </div>
  );
}
