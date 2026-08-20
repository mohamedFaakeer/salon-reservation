"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchAudit,
  type AuditRecord,
  type ListMeta,
} from "../../../lib/api-client";
import { canViewAudit } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row } from "../../../components/data-table";
import { Pager } from "../../../components/pager";
import { formatDate, formatTime } from "../../../lib/format";

/**
 * Audit trail — who changed what, and when.
 *
 * Read-only by construction: there is no write path to this table from the
 * client, and a log an operator could edit would not be worth keeping.
 *
 * Actions are stored as SCREAMING_SNAKE constants. They are rendered as
 * sentences because the reader is an owner asking "who cancelled that
 * booking", not an engineer reading an enum.
 */

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  "Appointment",
  "Payment",
  "Refund",
  "Service",
  "Staff",
  "WorkingSchedule",
  "StaffLeave",
  "Closure",
  "Tenant",
] as const;

function humanAction(action: string): string {
  return action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function AuditPage() {
  const { user } = useAuth();
  const canView = canViewAudit(user?.roles ?? []);

  const [entityType, setEntityType] = useState("");
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<AuditRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAudit({ entityType: entityType || undefined, limit: PAGE_SIZE, offset })
      .then((res) => {
        setEntries(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load the audit trail.");
      })
      .finally(() => setLoading(false));
  }, [entityType, offset]);

  useEffect(load, [load]);

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          The audit trail is limited to owners and managers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Header />

      <div className="flex flex-wrap gap-2">
        <select
          data-testid="audit-entity-filter"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setOffset(0);
          }}
          aria-label="Filter by what was changed"
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        >
          <option value="">Everything</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {entityType ? (
          <button
            type="button"
            data-testid="audit-clear-filter"
            onClick={() => {
              setEntityType("");
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
        <TableSkeleton rows={8} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={
            entityType
              ? `Nothing has been recorded against ${entityType} yet.`
              : "Nothing recorded yet."
          }
        />
      ) : (
        <>
          <DataTable
            caption="Audit trail for this salon"
            columns={[
              { label: "When" },
              { label: "Who" },
              { label: "Did what" },
              { label: "To" },
            ]}
          >
            {entries.map((entry) => (
              <Row key={entry.id} testId={`audit-row-${entry.id}`}>
                <Cell>
                  <span className="block text-slate-800 tabular">
                    {formatDate(entry.createdAt)}
                  </span>
                  <span className="block text-xs text-slate-500 tabular">
                    {formatTime(entry.createdAt)}
                  </span>
                </Cell>
                <Cell>
                  {entry.actorUser ? (
                    <>
                      <span className="block text-slate-800">{entry.actorUser.name}</span>
                      <span className="block text-xs text-slate-500">
                        {entry.actorUser.email}
                      </span>
                    </>
                  ) : (
                    /* A null actor is the scheduler, not a missing name — hold
                       expiry and reminder dispatch have no human behind them. */
                    <span className="text-xs text-slate-500">System</span>
                  )}
                </Cell>
                <Cell>
                  <span className="text-slate-800">{humanAction(entry.action)}</span>
                </Cell>
                <Cell>
                  <span className="block text-xs text-slate-600">{entry.entityType}</span>
                  {entry.entityId ? (
                    <span className="block text-xs text-slate-400 tabular">
                      {entry.entityId.slice(0, 8)}
                    </span>
                  ) : null}
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
              unit="entry"
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
      <h1 className="text-xl font-semibold text-slate-900">Audit</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Who changed what, newest first. Entries are never edited or removed.
      </p>
    </div>
  );
}
