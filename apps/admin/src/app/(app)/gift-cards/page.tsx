"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import { ApiRequestError, fetchGiftCards, type GiftCardView } from "../../../lib/api-client";
import { canManageGiftCards } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { GiftCardCreateDrawer } from "../../../components/gift-card-create-drawer";
import { GiftCardDetailDrawer } from "../../../components/gift-card-detail-drawer";
import { GiftCardVoidModal } from "../../../components/gift-card-void-modal";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { useToast } from "../../../components/toast";

const STATUS_STYLE: Record<GiftCardView["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  REDEEMED: { label: "Redeemed", className: "bg-slate-100 text-slate-500" },
  VOID: { label: "Void", className: "bg-red-100 text-red-700" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" });
}

export default function GiftCardsPage() {
  const { user } = useAuth();
  const canManage = canManageGiftCards(user?.roles ?? []);
  const toast = useToast();

  const [cards, setCards] = useState<GiftCardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [voiding, setVoiding] = useState<GiftCardView | null>(null);
  const [viewing, setViewing] = useState<GiftCardView | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    fetchGiftCards({ q: query || undefined })
      .then(setCards)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load gift cards."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(""), [load]);

  const outstandingCents = cards
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + c.remainingBalanceCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Gift cards</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cards.length} issued · {formatPriceCents(outstandingCents)} in outstanding balance
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            data-testid="gift-card-create-open"
            onClick={() => setShowCreate(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            + Create gift card
          </button>
        ) : null}
      </div>

      <input
        data-testid="gift-card-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            load(q);
          }
        }}
        placeholder="Search by code, purchaser name or phone…"
        className="min-h-11 max-w-sm rounded border border-slate-300 px-3 text-sm"
      />

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : cards.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No gift cards yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.4fr_1.2fr_1.2fr_1.3fr_0.9fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Code</span>
            <span>Purchaser</span>
            <span>Recipient</span>
            <span>Balance</span>
            <span>Expires</span>
            <span>Status</span>
          </div>
          {cards.map((card) => {
            const status = STATUS_STYLE[card.status];
            const percentLeft = card.initialValueCents > 0 ? (card.remainingBalanceCents / card.initialValueCents) * 100 : 0;
            return (
              <div
                key={card.id}
                data-testid={`gift-card-row-${card.code}`}
                role="button"
                tabIndex={0}
                onClick={() => setViewing(card)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setViewing(card);
                  }
                }}
                className="grid cursor-pointer grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.4fr_1.2fr_1.2fr_1.3fr_0.9fr_0.8fr] sm:items-center sm:gap-3"
              >
                <span className={`font-mono text-[13px] font-semibold text-slate-900 ${card.status === "VOID" ? "text-slate-400 line-through" : ""}`}>
                  {card.code}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{card.purchaser?.name ?? "—"}</span>
                  <span className="block truncate text-xs text-slate-400">{card.purchaser?.phone}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{card.recipientName ?? "—"}</span>
                </span>
                <span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {formatPriceCents(card.remainingBalanceCents)}
                  </span>{" "}
                  <span className="text-xs text-slate-400 tabular-nums">of {formatPriceCents(card.initialValueCents)}</span>
                  {card.status !== "VOID" ? (
                    <span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-slate-200">
                      <span
                        className="block h-full rounded-full bg-teal-600"
                        style={{ width: `${percentLeft}%` }}
                      />
                    </span>
                  ) : null}
                </span>
                <span className={`text-xs ${card.expired && card.status === "ACTIVE" ? "font-medium text-amber-700" : "text-slate-500"}`}>
                  {formatDate(card.expiresAt)}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                    {card.expired && card.status === "ACTIVE" ? "Expired" : status.label}
                  </span>
                  {canManage && card.status === "ACTIVE" ? (
                    <button
                      type="button"
                      data-testid={`gift-card-void-${card.code}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVoiding(card);
                      }}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Void
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <GiftCardCreateDrawer
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            toast.success("Gift card created");
            load(q);
          }}
        />
      ) : null}

      {voiding ? (
        <GiftCardVoidModal
          card={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => {
            toast.success("Gift card voided");
            setVoiding(null);
            setViewing(null);
            load(q);
          }}
        />
      ) : null}

      {viewing ? <GiftCardDetailDrawer card={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
