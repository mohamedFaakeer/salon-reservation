"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchInvoices,
  issueInvoice,
  sendInvoice,
  type AppointmentDetail,
  type InvoiceRecord,
} from "../lib/api-client";
import { errorCopy } from "../lib/error-copy";
import { formatPriceCents } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { InvoiceDocument } from "./invoice-document";
import { BusyLabel } from "./spinner";
import { useToast } from "./toast";

/**
 * The invoice for a finished visit: whether it went out, and how to send it
 * again.
 *
 * Older versions are listed but folded away. They matter when somebody asks
 * "what did you actually send me in September?", and clutter every other day.
 */
export function InvoicePanel({ appointment }: { appointment: AppointmentDetail }) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [email, setEmail] = useState(appointment.customer.email ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetchInvoices(appointment.id)
      .then(setInvoices)
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [appointment.id]);

  useEffect(load, [load]);

  const live = invoices.find((i) => i.status === "ISSUED") ?? null;
  const superseded = invoices.filter((i) => i.status === "SUPERSEDED");

  async function issue(): Promise<void> {
    setBusy(true);
    try {
      const invoice = await issueInvoice(appointment.id);
      // Idempotent server-side, so the honest message depends on what came
      // back rather than on what was clicked.
      toast.success(
        live && invoice.id === live.id ? "Invoice is already up to date" : `Invoice ${invoice.number} issued`,
      );
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  async function send(invoice: InvoiceRecord): Promise<void> {
    setBusy(true);
    try {
      await sendInvoice(invoice.id, email.trim());
      toast.success(`Invoice ${invoice.number} sent`, email.trim());
      setSendingId(null);
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="rounded border border-slate-200 p-3 text-sm">
      <p className="mb-1 text-sm font-medium text-slate-700">Invoice</p>

      {!live ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-slate-500">
            {appointment.status === "COMPLETED"
              ? "Not issued yet."
              : "Issued once the service is completed."}
          </span>
          <button
            type="button"
            data-testid="issue-invoice"
            onClick={() => void issue()}
            disabled={busy}
            className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <BusyLabel busy={busy} busyText="Issuing…">
              Issue now
            </BusyLabel>
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-slate-900 tabular">{live.number}</span>
            <span className="text-slate-600 tabular">{formatPriceCents(live.totalCents)}</span>
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            {live.lastSentAt ? (
              <>
                Sent to <span className="text-slate-700">{live.lastSentTo}</span> on{" "}
                <span className="tabular">{shortDate(live.lastSentAt)}</span>
              </>
            ) : appointment.customer.email ? (
              "Not sent yet."
            ) : (
              /* The honest version of a silent failure: the invoice exists,
                 nothing was emailed, and here is why. */
              "Not sent — no email on file for this customer."
            )}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="view-invoice"
              onClick={() => setViewing(live)}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              View
            </button>
            <button
              type="button"
              data-testid="resend-invoice"
              onClick={() => setSendingId(sendingId === live.id ? null : live.id)}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {live.lastSentAt ? "Send again" : "Send"}
            </button>
            <button
              type="button"
              data-testid="reissue-invoice"
              onClick={() => void issue()}
              disabled={busy}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Reissue
            </button>
          </div>

          {sendingId === live.id ? (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-xs text-slate-500">
                Send to
                <input
                  type="email"
                  data-testid="invoice-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                data-testid="confirm-send-invoice"
                onClick={() => void send(live)}
                disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                className="min-h-9 rounded bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <BusyLabel busy={busy} busyText="Sending…">
                  Send
                </BusyLabel>
              </button>
            </div>
          ) : null}

          {superseded.length > 0 ? (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                data-testid="invoice-history-toggle"
                aria-expanded={showHistory}
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                {showHistory ? "Hide" : "Show"} {superseded.length} earlier version
                {superseded.length === 1 ? "" : "s"}
              </button>
              {showHistory ? (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {superseded.map((old) => (
                    <li key={old.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 tabular">
                        {old.number} · {formatPriceCents(old.totalCents)} ·{" "}
                        {shortDate(old.issuedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewing(old)}
                        className="shrink-0 text-slate-500 underline hover:text-slate-800"
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {viewing ? (
        <DrawerShell title={`Invoice ${viewing.number}`} onClose={() => setViewing(null)}>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              data-testid="print-invoice"
              onClick={() => window.print()}
              className="min-h-11 w-fit rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
            >
              Print or save as PDF
            </button>
            <InvoiceDocument invoice={viewing} />
          </div>
        </DrawerShell>
      ) : null}
    </div>
  );
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Colombo",
  });
}
