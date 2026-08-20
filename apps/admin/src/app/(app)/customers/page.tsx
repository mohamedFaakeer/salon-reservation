"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiRequestError,
  fetchCustomers,
  type CustomerRecord,
  type ListMeta,
} from "../../../lib/api-client";
import { canManageCustomers } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../components/data-table";
import { Pager } from "../../../components/pager";
import { formatDate, formatPhone } from "../../../lib/format";

/**
 * Customers — the salon's address book.
 *
 * Search runs on the server and is debounced, because a receptionist looking
 * up "0771…" while a customer waits at the desk types the number one digit at
 * a time, and a request per keystroke helps nobody.
 *
 * Changing the search resets to the first page. Keeping the offset would show
 * "51-75 of 3" — an empty table for a query that has matches.
 */

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = canManageCustomers(user?.roles ?? []);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    fetchCustomers({ q: debounced, limit: PAGE_SIZE, offset })
      .then((res) => {
        setCustomers(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load customers.");
      })
      .finally(() => setLoading(false));
  }, [debounced, offset]);

  useEffect(load, [load]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Customer records are not part of your role. Ask a receptionist or manager.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Header />

      <input
        data-testid="customer-list-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or phone…"
        aria-label="Search customers"
        className="min-h-11 w-full max-w-md rounded border border-slate-300 px-3 text-sm"
      />

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : customers.length === 0 ? (
        <EmptyState
          title={
            debounced
              ? `Nobody matches "${debounced}".`
              : "No customers yet — they're added the first time someone books."
          }
        />
      ) : (
        <>
          <DataTable
            caption="Customers of this salon"
            columns={[
              { label: "Name" },
              { label: "Phone" },
              { label: "Email" },
              { label: "Customer since", align: "right" },
            ]}
          >
            {customers.map((customer) => (
              <Row key={customer.id} testId={`customer-row-${customer.id}`}>
                <Cell>
                  {/* The whole row is a destination, but only the name is the
                      link — a row-wide click target steals text selection from
                      someone trying to copy a phone number. */}
                  <Link
                    href={`/customers/${customer.id}`}
                    data-testid={`customer-link-${customer.id}`}
                    className="font-medium text-teal-700 hover:underline"
                  >
                    {customer.firstName} {customer.lastName}
                  </Link>
                </Cell>
                <Cell>
                  <span className="tabular">{formatPhone(customer.phone)}</span>
                </Cell>
                <Cell>
                  {customer.email ? (
                    <span className="text-slate-700">{customer.email}</span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell align="right">
                  <span className="text-slate-600 tabular">{formatDate(customer.createdAt)}</span>
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
              unit="customer"
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
      <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Everyone who has booked, by name or phone number.
      </p>
    </div>
  );
}
