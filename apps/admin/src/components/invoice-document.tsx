"use client";

import { DEFAULT_LOGO_DATA_URI } from "@salon/shared";
import type { InvoiceRecord } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";

/**
 * The invoice, as a document.
 *
 * Deliberately not styled like the rest of the admin. Every other screen is a
 * tool the operator works inside; this is a thing that gets printed, filed and
 * argued over, and it should look like one — white paper, generous margins,
 * the salon's name at the top and the number where an eye goes looking for it.
 *
 * Rendered entirely from the frozen snapshot. A year-old invoice opened today
 * shows the salon as it was, which is the whole reason the snapshot exists.
 *
 * `print:` utilities strip the chrome so Ctrl-P produces a clean PDF. That is
 * the deliberate answer to "we need a PDF" — the browser already has a good
 * PDF engine, and adding a headless renderer to produce the same page would be
 * a heavyweight dependency earning nothing.
 */
export function InvoiceDocument({ invoice }: { invoice: InvoiceRecord }) {
  const { salon, customer, appointment, lines, billDiscount, payments } = invoice.snapshot;
  const superseded = invoice.status === "SUPERSEDED";

  return (
    <article
      data-testid="invoice-document"
      className="mx-auto max-w-2xl bg-white p-8 text-slate-900 print:max-w-none print:p-0"
    >
      {superseded ? (
        <p className="mb-5 rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          This version has been replaced. It is kept as a record of what was sent.
        </p>
      ) : null}
      {invoice.version > 1 && !superseded ? (
        <p className="mb-5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This replaces an earlier invoice for the same visit.
        </p>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 p-1">
            <img
              src={salon.logoUrl ?? DEFAULT_LOGO_DATA_URI}
              alt=""
              className="h-full w-full object-contain"
            />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{salon.name}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {[salon.address, salon.city].filter(Boolean).join(", ")}
              {salon.phone ? (
                <>
                  <br />
                  {salon.phone}
                </>
              ) : null}
              {/* Printed only when the salon has one. An empty label is worse
                  than no label. */}
              {salon.businessRegNo ? (
                <>
                  <br />
                  Business reg. {salon.businessRegNo}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
            Invoice
          </p>
          <p className="text-lg font-semibold text-teal-700 tabular">{invoice.number}</p>
          <p className="text-xs text-slate-500 tabular">{formatLongDate(invoice.issuedAt)}</p>
        </div>
      </header>

      <section className="flex flex-wrap justify-between gap-6 py-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
            Billed to
          </p>
          <p className="mt-0.5 font-medium">{customer.name}</p>
          <p className="text-sm text-slate-500 tabular">{customer.phone}</p>
          {customer.email ? <p className="text-sm text-slate-500">{customer.email}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
            Visit
          </p>
          <p className="mt-0.5 text-sm tabular">{formatLongDateTime(appointment.startTime)}</p>
          <p className="text-sm text-slate-500">with {appointment.staffName}</p>
          <p className="text-xs text-slate-400 tabular">{appointment.bookingReference}</p>
        </div>
      </section>

      <table className="w-full border-collapse">
        <caption className="sr-only">Services on this invoice</caption>
        <thead>
          <tr className="border-y border-slate-200">
            <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Service
            </th>
            <th className="py-2 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={`${line.name}-${i}`} className="border-b border-slate-100">
              <td className="py-2.5 align-top">
                <span className="block text-sm">{line.name}</span>
                <span className="block text-xs text-slate-400 tabular">{line.durationMin} min</span>
                {line.discountCents > 0 ? (
                  <span className="block text-xs text-teal-700">
                    {line.discountLabel ?? "Offer"} −{formatPriceCents(line.discountCents)}
                  </span>
                ) : null}
              </td>
              <td className="py-2.5 text-right align-top text-sm tabular">
                {line.discountCents > 0 ? (
                  <span className="block text-xs text-slate-400 line-through">
                    {formatPriceCents(line.listPriceCents)}
                  </span>
                ) : null}
                {formatPriceCents(line.chargedCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs">
          <Line label="Subtotal" value={formatPriceCents(invoice.subtotalCents)} muted />
          {invoice.serviceDiscountCents > 0 ? (
            <Line
              label="Offers"
              value={`−${formatPriceCents(invoice.serviceDiscountCents)}`}
              muted
            />
          ) : null}
          {billDiscount ? (
            /* Named separately from the offers: one is a price the salon
               published, the other a decision somebody made. */
            <Line
              label={billDiscount.reason ? `Discount — ${billDiscount.reason}` : "Discount"}
              value={`−${formatPriceCents(billDiscount.cents)}`}
              muted
            />
          ) : null}
          <div className="my-1.5 border-t border-slate-300" />
          <Line label="Total" value={formatPriceCents(invoice.totalCents)} strong />
          <Line label="Paid" value={formatPriceCents(invoice.paidCents)} muted />
          <Line
            label={invoice.balanceCents > 0 ? "Balance due" : "Settled"}
            value={formatPriceCents(Math.max(0, invoice.balanceCents))}
            strong
          />
        </dl>
      </section>

      {payments.length > 0 ? (
        <section className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">
            Payments received
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {payments.map((p, i) => (
              <li key={i} className="text-sm text-slate-700 tabular">
                {formatLongDate(p.recordedAt)} · {methodLabel(p.method)} ·{" "}
                {formatPriceCents(p.amountCents)}
                {p.changeCents ? (
                  <span className="text-slate-500">
                    {" "}
                    (tendered {formatPriceCents(p.tenderedCents ?? 0)}, change {formatPriceCents(p.changeCents)})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Thank you for visiting {salon.name}.
      </footer>
    </article>
  );
}

function Line({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={`text-sm ${muted ? "text-slate-500" : "text-slate-900"}`}>{label}</dt>
      <dd
        className={`text-sm tabular ${strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD_CAPTURED: "Card",
  BANK_TRANSFER: "Bank transfer",
  ONLINE: "Online",
  GATEWAY: "Gateway",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function formatLongDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  });
}

function formatLongDateTime(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}
