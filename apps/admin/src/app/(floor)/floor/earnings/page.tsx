"use client";

import { useEffect, useState } from "react";
import {
  fetchMyIncentivePayouts,
  fetchMyIncentivePreview,
  type IncentivePayoutView,
  type IncentivePreviewRow,
} from "../../../../lib/api-client";
import { formatPriceCents, todayLocalDate } from "../../../../lib/format";

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

const STATUS_LABEL: Record<IncentivePayoutView["status"], string> = {
  PAID: "Paid",
  FINALISED: "Finalised",
  VOID: "Void",
};

export default function FloorEarningsPage() {
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<IncentivePreviewRow | null>(null);
  const [payouts, setPayouts] = useState<IncentivePayoutView[]>([]);

  useEffect(() => {
    Promise.all([
      fetchMyIncentivePreview({ from: firstOfMonth(), to: todayLocalDate() }),
      fetchMyIncentivePayouts(),
    ])
      .then(([preview, history]) => {
        setLive(preview);
        setPayouts(history);
      })
      .catch(() => {
        setLive(null);
        setPayouts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <div className="skeleton h-32 rounded-[20px]" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-16 rounded-xl" />
      </div>
    );
  }

  if (!live && payouts.length === 0) {
    return (
      <div className="flex flex-col gap-4 pt-1">
        <h1 className="text-lg font-bold text-slate-900">My earnings</h1>
        <div className="rounded-[18px] border border-slate-200 bg-white p-5 text-center">
          <p className="text-sm text-slate-500">
            No incentive plan is assigned to you yet. Ask your manager once one is set up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <h1 className="text-lg font-bold text-slate-900">My earnings</h1>

      <div
        className="rounded-[20px] p-6 text-white"
        style={{ background: "linear-gradient(155deg, #0d9488 0%, #0f766e 100%)" }}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-100">This month, so far</p>
        <p className="tabular mt-1 text-[34px] font-bold leading-none tracking-tight">
          {formatPriceCents(live?.totalCents ?? 0)}
        </p>
        <p className="mt-1.5 text-[12.5px] text-teal-50">Updates as you work — not final until finalised</p>
      </div>

      {live ? (
        <div className="rounded-[14px] border border-slate-200 bg-white p-4">
          {live.commissionCents > 0 ? <BreakdownLine label="Commission" value={formatPriceCents(live.commissionCents)} /> : null}
          {live.perJobCents > 0 ? <BreakdownLine label="Per job" value={formatPriceCents(live.perJobCents)} /> : null}
          {live.tierBonusCents > 0 ? <BreakdownLine label="Tier bonus" value={formatPriceCents(live.tierBonusCents)} /> : null}
          <div className="mt-1 border-t border-slate-100 pt-2">
            <BreakdownLine label="Jobs completed" value={String(live.jobsCompleted)} />
          </div>
        </div>
      ) : null}

      {payouts.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Past payouts</p>
          <div className="flex flex-col gap-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
              >
                <span className="tabular text-[13px] font-semibold text-slate-900">
                  {p.periodStart} – {p.periodEnd}
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular text-[13px] font-bold text-slate-900">{formatPriceCents(p.totalCents)}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      p.status === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BreakdownLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="tabular font-semibold text-slate-900">{value}</span>
    </div>
  );
}
