"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, fetchRetailSaleReceipt, type RetailSaleReceiptView } from "../../../lib/api-client";
import { formatDateTime, formatPriceCents } from "../../../lib/format";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD_CAPTURED: "Card",
  ONLINE: "Online",
  GATEWAY: "Gateway",
  GIFT_CARD: "Gift card",
  PACKAGE_CREDIT: "Package credit",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

/**
 * What a "Share" button on the till texts to a customer. No login — the id
 * in the URL is the only credential, same pattern as `/booking/[reference]`.
 * Read mode: the visitor is here to see what they paid, nothing more.
 */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<RetailSaleReceiptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRetailSaleReceipt(id)
      .then((view) => {
        if (!cancelled) setReceipt(view);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError && err.statusCode === 404
            ? "We couldn't find that receipt. The link may be out of date."
            : "Couldn't load this receipt. Please try again in a moment.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-5 pb-16 pt-8">
        <ReceiptSkeleton />
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="mx-auto min-h-screen max-w-lg px-5 pb-16 pt-8">
        <h1 className="text-2xl font-bold text-[var(--resist)]">Your receipt</h1>
        <p role="alert" className="mt-4 text-[13px] font-semibold text-[#E4867F]">
          {error ?? "Couldn't load this receipt."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 pb-16 pt-8">
      <h1 className="text-2xl font-bold text-[var(--resist)]">Your receipt</h1>
      <p className="mt-1 text-[13px] text-[var(--resist-dim)]">
        {receipt.salon.name} · <span className="tabular">{formatDateTime(receipt.createdAt)}</span>
      </p>

      <div className="mt-6 rounded-[var(--radius)] border border-[rgba(240,231,214,0.16)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-[var(--resist-dim)]">Sold to</p>
            <p className="mt-0.5 font-bold text-[var(--resist)]">
              {receipt.customer.isWalkIn ? "Walk-in customer" : receipt.customer.name}
            </p>
          </div>
          {receipt.salon.address || receipt.salon.phone ? (
            <div className="text-right">
              <p className="text-[12px] text-[var(--resist-dim)]">Salon</p>
              <p className="mt-0.5 text-[13px] text-[var(--resist)]">
                {[receipt.salon.address, receipt.salon.city].filter(Boolean).join(", ")}
              </p>
              {receipt.salon.phone ? (
                <p className="text-[13px] tabular text-[var(--resist)]">{receipt.salon.phone}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius)] border border-[rgba(240,231,214,0.16)] p-4">
        <table className="w-full border-collapse">
          <caption className="sr-only">Items on this receipt</caption>
          <thead>
            <tr className="border-b border-[rgba(240,231,214,0.16)]">
              <th className="pb-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--resist-dim)]">
                Item
              </th>
              <th className="pb-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--resist-dim)]">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <tr key={line.id} className="border-b border-[rgba(240,231,214,0.08)]">
                <td className="py-3 align-top text-sm">
                  <span className="text-[var(--resist)]">
                    {line.nameSnapshot}
                    {line.bundleId ? (
                      <span className="ml-2 rounded-full border border-[rgba(240,231,214,0.3)] px-2 py-px text-[9.5px] uppercase tracking-[0.04em] text-[var(--resist-dim)]">
                        Bundle
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular block text-[12px] text-[var(--resist-dim)]">×{line.quantity}</span>
                </td>
                <td className="tabular py-3 text-right align-top text-sm text-[var(--resist)]">
                  {formatPriceCents(line.lineTotalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1 border-t border-[rgba(240,231,214,0.2)] pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-[var(--resist)]">Total</span>
            <span className="tabular text-lg font-bold text-[var(--resist)]">{formatPriceCents(receipt.totalCents)}</span>
          </div>
        </div>

        {receipt.paymentMethod ? (
          <div className="mt-4 flex items-center justify-between border-t border-[rgba(240,231,214,0.16)] pt-3">
            <p className="text-[12px] text-[var(--resist-dim)]">Paid via</p>
            <span className="rounded-full bg-[var(--dye)] px-3 py-1 text-[12.5px] font-bold text-[#022b27]">
              {methodLabel(receipt.paymentMethod)}
            </span>
          </div>
        ) : null}
      </div>

      <p className="mt-8 text-center text-[12.5px] text-[var(--resist-dim)]">
        Thank you for shopping at <span className="font-semibold text-[var(--bloom)]">{receipt.salon.name}</span>.
      </p>
    </main>
  );
}

/** Mirrors the loaded receipt's exact shape, per `BookingDetailSkeleton`'s own convention, so nothing jumps when it lands. */
function ReceiptSkeleton() {
  return (
    <div role="status" aria-label="Loading your receipt">
      <div className="h-7 w-40 rounded-md bg-[rgba(240,231,214,0.08)]" />
      <div className="mt-2 h-4 w-56 rounded-md bg-[rgba(240,231,214,0.08)]" />
      <div className="mt-6 h-20 rounded-[var(--radius)] bg-[rgba(240,231,214,0.06)]" />
      <div className="mt-4 h-48 rounded-[var(--radius)] bg-[rgba(240,231,214,0.06)]" />
    </div>
  );
}
