"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchInquiries,
  updateInquiry,
  type CustomerRecord,
  type InquiryRecord,
  type InquiryStatusValue,
  type ListMeta,
} from "../lib/api-client";
import { errorCopy } from "../lib/error-copy";
import { BookingDrawer } from "./booking-drawer";
import { Cell, DataTable, Row, RowActions } from "./data-table";
import { EmptyState } from "./empty-state";
import { TableSkeleton } from "./loading-skeleton";
import { Pager } from "./pager";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";
import { formatDate, formatPhone, formatTime } from "../lib/format";

/**
 * Questions people asked that are not bookings.
 *
 * Defaults to Open rather than All, because an inquiry is a thing you still
 * owe somebody an answer to. A list that opens on every inquiry ever logged
 * buries the three you need to call back today.
 */

const PAGE_SIZE = 25;

const FILTERS: Array<{ value: InquiryStatusValue | ""; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "CONVERTED", label: "Booked" },
  { value: "CLOSED", label: "Closed" },
  { value: "", label: "All" },
];

const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
};

export function InquiriesPanel() {
  const [status, setStatus] = useState<InquiryStatusValue | "">("OPEN");
  const [offset, setOffset] = useState(0);
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [converting, setConverting] = useState<InquiryRecord | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchInquiries({ status: status || undefined, limit: PAGE_SIZE, offset })
      .then((res) => {
        setInquiries(res.data);
        setMeta(res.meta);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load inquiries.");
      })
      .finally(() => setLoading(false));
  }, [status, offset]);

  useEffect(load, [load]);

  async function setInquiryStatus(
    inquiry: InquiryRecord,
    next: InquiryStatusValue,
  ): Promise<void> {
    setBusyId(inquiry.id);
    try {
      await updateInquiry(inquiry.id, { status: next });
      toast.success(next === "CLOSED" ? "Inquiry closed" : "Inquiry reopened");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * The booking is already made by the time this runs — the drawer created it
   * through the ordinary availability engine. All that is left is recording
   * which inquiry it came from.
   *
   * If this link fails the booking still stands, and the inquiry stays open
   * for someone to close by hand. That is the right way round: the alternative
   * design, where the link is made first, can leave an inquiry claiming a
   * booking that was never created.
   */
  async function linkConversion(inquiry: InquiryRecord, appointmentId: string): Promise<void> {
    try {
      await updateInquiry(inquiry.id, { status: "CONVERTED", appointmentId });
      toast.success("Inquiry booked", "Marked as converted and linked to the appointment.");
    } catch (err) {
      const copy = errorCopy(err);
      toast.warn(
        "Booked, but the inquiry is still open",
        `${copy.detail} The appointment itself was created.`,
      );
    } finally {
      load();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => {
          const active = status === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              data-testid={`inquiry-filter-${filter.value || "ALL"}`}
              aria-pressed={active}
              onClick={() => {
                setStatus(filter.value);
                setOffset(0);
              }}
              className={`min-h-11 rounded border px-3 text-sm font-medium transition-colors ${
                active
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : inquiries.length === 0 ? (
        <EmptyState
          title={
            status === "OPEN"
              ? "Nothing waiting on an answer."
              : "No inquiries match that filter."
          }
        />
      ) : (
        <>
          <DataTable
            caption="Questions asked that have not become bookings"
            columns={[
              { label: "Who" },
              { label: "Asked about" },
              { label: "Asked" },
              { label: "Status" },
              { label: "Actions", srOnly: true },
            ]}
          >
            {inquiries.map((inquiry) => {
              const busy = busyId === inquiry.id;
              return (
                <Row key={inquiry.id} testId={`inquiry-row-${inquiry.id}`}>
                  <Cell>
                    <span className="block font-medium text-slate-900">
                      {inquiry.customer
                        ? `${inquiry.customer.firstName} ${inquiry.customer.lastName}`
                        : "Unknown"}
                    </span>
                    <span className="block text-xs text-slate-500 tabular">
                      {inquiry.customer ? formatPhone(inquiry.customer.phone) : ""}
                    </span>
                  </Cell>
                  <Cell>
                    {inquiry.services.length > 0 ? (
                      <ul className="flex flex-wrap gap-1">
                        {inquiry.services.map((s) => (
                          <li
                            key={`${inquiry.id}-${s.name}`}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                          >
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-slate-400">Nothing specific</span>
                    )}
                    {inquiry.notes ? (
                      <p className="mt-1 max-w-md whitespace-pre-wrap text-xs text-slate-600">
                        {inquiry.notes}
                      </p>
                    ) : null}
                  </Cell>
                  <Cell>
                    <span className="block text-slate-700 tabular">
                      {formatDate(inquiry.createdAt)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatTime(inquiry.createdAt)} · {SOURCE_LABELS[inquiry.source]}
                    </span>
                  </Cell>
                  <Cell>
                    <InquiryStatusBadge status={inquiry.status} />
                  </Cell>
                  <RowActions>
                    {inquiry.status === "CONVERTED" ? (
                      <span className="text-xs text-slate-400">Booked</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-testid={`inquiry-convert-${inquiry.id}`}
                          onClick={() => setConverting(inquiry)}
                          disabled={busy || !inquiry.customer}
                          className="min-h-11 rounded border border-teal-600 px-2.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                        >
                          Book this
                        </button>
                        <button
                          type="button"
                          data-testid={`inquiry-toggle-${inquiry.id}`}
                          onClick={() =>
                            void setInquiryStatus(
                              inquiry,
                              inquiry.status === "CLOSED" ? "OPEN" : "CLOSED",
                            )
                          }
                          disabled={busy}
                          className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                        >
                          <BusyLabel busy={busy} busyText="Saving…">
                            {inquiry.status === "CLOSED" ? "Reopen" : "Close"}
                          </BusyLabel>
                        </button>
                      </>
                    )}
                  </RowActions>
                </Row>
              );
            })}
          </DataTable>

          {meta ? (
            <Pager
              total={meta.total}
              limit={meta.limit}
              offset={meta.offset}
              onOffsetChange={setOffset}
              unit="inquiry"
              busy={loading}
            />
          ) : null}
        </>
      )}

      {converting?.customer ? (
        <BookingDrawer
          lockMode
          initialCustomer={toCustomerRecord(converting)}
          initialServiceIds={converting.services
            .map((s) => s.serviceId)
            .filter((id): id is string => id !== null)}
          onClose={() => setConverting(null)}
          onCreated={(appointment) => {
            const inquiry = converting;
            setConverting(null);
            if (appointment) {
              void linkConversion(inquiry, appointment.id);
            } else {
              load();
            }
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * `createdAt` is the inquiry's, not the customer's — the drawer only reads it
 * for the CustomerRecord shape and never displays it, and inventing a wrong
 * "customer since" would be worse than reusing a date it does not show.
 */
function toCustomerRecord(inquiry: InquiryRecord): CustomerRecord {
  return {
    id: inquiry.customer!.id,
    firstName: inquiry.customer!.firstName,
    lastName: inquiry.customer!.lastName,
    phone: inquiry.customer!.phone,
    email: null,
    createdAt: inquiry.createdAt,
  };
}

function InquiryStatusBadge({ status }: { status: InquiryStatusValue }) {
  const style =
    status === "OPEN"
      ? "bg-amber-100 text-amber-900"
      : status === "CONVERTED"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-zinc-200 text-zinc-800";
  const label = status === "OPEN" ? "Open" : status === "CONVERTED" ? "Booked" : "Closed";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
