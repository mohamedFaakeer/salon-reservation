"use client";

import type { RetailSaleReceiptView } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD_CAPTURED: "Card",
  BANK_TRANSFER: "Bank transfer",
  QR: "QR",
  ONLINE: "Online",
  GATEWAY: "Gateway",
  GIFT_CARD: "Gift card",
  PACKAGE_CREDIT: "Package credit",
};

/**
 * The retail receipt, as a document — the same deliberate choice as
 * `InvoiceDocument`: white paper, generous margins, `print:` utilities strip
 * the chrome so Ctrl-P produces a clean PDF rather than reaching for a
 * headless PDF renderer. This is also exactly what a customer sees at the
 * far end of a "Share" link, with no admin chrome around it at all — so it
 * never assumes an authenticated viewer.
 */
export function RetailSaleReceipt({ receipt }: { receipt: RetailSaleReceiptView }) {
  const { salon, customer, lines } = receipt;

  return (
    <article
      data-testid="retail-sale-receipt"
      className="mx-auto max-w-2xl bg-white p-8 text-slate-900 print:max-w-none print:p-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-5">
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
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Receipt</p>
          <p className="text-lg font-semibold text-teal-700 tabular">R-{receipt.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-slate-500 tabular">{formatLongDateTime(receipt.createdAt)}</p>
        </div>
      </header>

      <section className="flex flex-wrap justify-between gap-6 py-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Sold to</p>
          <p className="mt-0.5 font-medium">{customer.isWalkIn ? "Walk-in customer" : customer.name}</p>
          {!customer.isWalkIn ? <p className="text-sm text-slate-500 tabular">{customer.phone}</p> : null}
        </div>
        {receipt.soldByName ? (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Rung up by</p>
            <p className="mt-0.5 text-sm">{receipt.soldByName}</p>
          </div>
        ) : null}
      </section>

      <table className="w-full border-collapse">
        <caption className="sr-only">Items on this receipt</caption>
        <thead>
          <tr className="border-y border-slate-200">
            <th className="py-2 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Item</th>
            <th className="py-2 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-slate-100">
              <td className="py-2.5 align-top">
                <span className="block text-sm">
                  {line.nameSnapshot}
                  {line.bundleId ? (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold text-amber-700">
                      KIT
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-slate-400 tabular">
                  {line.skuSnapshot ? `${line.skuSnapshot} · ` : ""}×{line.quantity}
                </span>
              </td>
              <td className="py-2.5 text-right align-top text-sm tabular">{formatPriceCents(line.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs">
          <Line label="Subtotal" value={formatPriceCents(receipt.subtotalCents)} muted />
          <div className="my-1.5 border-t border-slate-300" />
          <Line label="Total" value={formatPriceCents(receipt.totalCents)} strong />
        </dl>
      </section>

      <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-slate-500">Paid via</p>
        <p className="text-sm font-semibold text-slate-700">
          {receipt.paymentMethod ? (METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod) : "—"}
        </p>
      </div>

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Thank you for shopping at {salon.name}.
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
      <dd className={`text-sm tabular ${strong ? "font-semibold text-slate-900" : muted ? "text-slate-500" : ""}`}>{value}</dd>
    </div>
  );
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
