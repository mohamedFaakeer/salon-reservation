"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiRequestError,
  fetchCustomerSegmentCounts,
  fetchCustomers,
  fetchTags,
  fetchTenantSettings,
  type CustomerDetail,
  type CustomerRecord,
  type CustomerSegment,
  type ListMeta,
  type TagRecord,
} from "../../../lib/api-client";
import { canManageCustomers } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../components/data-table";
import { Pager } from "../../../components/pager";
import { CustomerFormDrawer } from "../../../components/customer-form-drawer";
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

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  NEW: "New",
  RECENT: "Recent",
  FIRST_VISIT: "First visit",
  UPCOMING_BIRTHDAY: "🎂 Upcoming birthdays",
  WEB: "Web customers",
};
const ALL_SEGMENTS: CustomerSegment[] = ["NEW", "RECENT", "FIRST_VISIT", "UPCOMING_BIRTHDAY", "WEB"];

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = canManageCustomers(user?.roles ?? []);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [segment, setSegment] = useState<CustomerSegment | null>(null);
  const [tagId, setTagId] = useState<string>("");
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [visibleSegments, setVisibleSegments] = useState<CustomerSegment[]>(ALL_SEGMENTS);
  const [segmentCounts, setSegmentCounts] = useState<Partial<Record<CustomerSegment, number>>>({});
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; customer: CustomerDetail } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!canManage) return;
    void fetchTags().then(setTags).catch(() => undefined);
    void fetchTenantSettings().then((s) => {
      if (s.customerSegmentSettings?.visibleSegments) {
        setVisibleSegments(s.customerSegmentSettings.visibleSegments);
      }
    });
    void refreshSegmentCounts();
  }, [canManage]);

  function refreshSegmentCounts(): void {
    fetchCustomerSegmentCounts()
      .then((rows) => {
        const map: Partial<Record<CustomerSegment, number>> = {};
        for (const row of rows) map[row.segment] = row.count;
        setSegmentCounts(map);
      })
      .catch(() => undefined);
  }

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCustomers({
      q: debounced,
      limit: PAGE_SIZE,
      offset,
      segment: segment ?? undefined,
      tagId: tagId || undefined,
    })
      .then((res) => {
        setCustomers(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load customers.");
      })
      .finally(() => setLoading(false));
  }, [debounced, offset, segment, tagId]);

  useEffect(load, [load]);

  if (!canManage) {
    return (
      <div className="flex flex-col gap-4">
        <Header canManage={false} onAdd={() => undefined} />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Customer records are not part of your role. Ask a receptionist or manager.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Header canManage onAdd={() => setDrawer({ mode: "create" })} />

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          data-testid="customer-list-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone…"
          aria-label="Search customers"
          className="min-h-11 w-full max-w-md rounded border border-slate-300 px-3 text-sm"
        />
        {tags.length > 0 ? (
          <select
            data-testid="customer-tag-filter"
            value={tagId}
            onChange={(e) => {
              setTagId(e.target.value);
              setOffset(0);
            }}
            className="min-h-10 rounded border border-slate-300 px-2.5 text-sm text-slate-700"
          >
            <option value="">Filter by tag: All</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by segment">
        <SegmentChip
          label="All"
          count={meta && !segment && !tagId && !debounced ? meta.total : undefined}
          active={segment === null}
          onClick={() => {
            setSegment(null);
            setOffset(0);
          }}
        />
        {ALL_SEGMENTS.filter((s) => visibleSegments.includes(s)).map((s) => (
          <SegmentChip
            key={s}
            label={SEGMENT_LABELS[s]}
            count={segmentCounts[s]}
            active={segment === s}
            onClick={() => {
              setSegment(s);
              setOffset(0);
            }}
          />
        ))}
      </div>

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
              : segment
                ? "No customers in this segment yet."
                : "No customers yet — add one, or they'll be added the first time someone books."
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
              { label: "Tags" },
              { label: "Customer since", align: "right" },
              { label: "" },
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
                    {customer.title ? `${customer.title} ` : ""}
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
                <Cell>
                  {customer.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {customer.tags.map((t) => (
                        <span
                          key={t.id}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: t.color ?? "#64748b" }}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell align="right">
                  <span className="text-slate-600 tabular">{formatDate(customer.createdAt)}</span>
                </Cell>
                <Cell align="right">
                  <button
                    type="button"
                    data-testid={`customer-edit-${customer.id}`}
                    onClick={() =>
                      setDrawer({ mode: "edit", customer: { ...customer, notes: null, marketingOptOut: false } })
                    }
                    aria-label={`Edit ${customer.firstName} ${customer.lastName}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-teal-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
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

      {drawer ? (
        <CustomerFormDrawer
          mode={drawer.mode}
          initial={drawer.mode === "edit" ? drawer.customer : undefined}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
            refreshSegmentCounts();
          }}
        />
      ) : null}
    </div>
  );
}

function SegmentChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-teal-600 bg-teal-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10.5px] tabular ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Header({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Everyone who has booked, by name or phone number.
        </p>
      </div>
      {canManage ? (
        <button
          type="button"
          data-testid="customer-add-button"
          onClick={onAdd}
          className="min-h-11 shrink-0 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Add customer
        </button>
      ) : null}
    </div>
  );
}
