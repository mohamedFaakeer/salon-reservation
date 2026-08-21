"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchMyAttendanceEditRequests,
  withdrawAttendanceEditRequest,
  type AttendanceEditRequestView,
} from "../../../../lib/api-client";
import { errorCopy } from "../../../../lib/error-copy";
import { useToast } from "../../../../components/toast";
import { EmptyState } from "../../../../components/empty-state";

const STATUS_STYLE: Record<string, { fill: string; fg: string; label: string }> = {
  PENDING: { fill: "#FEF3C7", fg: "#92400E", label: "Pending" },
  APPROVED: { fill: "#D1FAE5", fg: "#065F46", label: "Approved" },
  REJECTED: { fill: "#E2E8F0", fg: "#475569", label: "Declined" },
  WITHDRAWN: { fill: "#E2E8F0", fg: "#94A3B8", label: "Withdrawn" },
};

export default function FloorRequestsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AttendanceEditRequestView[]>([]);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  function load(): void {
    setLoading(true);
    fetchMyAttendanceEditRequests()
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function withdraw(id: string): Promise<void> {
    setWithdrawing(id);
    try {
      await withdrawAttendanceEditRequest(id);
      toast.success("Request withdrawn");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setWithdrawing(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-900">My requests</h1>
        <Link
          href="/floor/requests/new"
          className="flex min-h-10 items-center rounded-xl bg-teal-600 px-3.5 text-[13px] font-bold text-white"
        >
          + New
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          title="No correction requests yet. If a check-in or check-out was missed, you can ask for it to be fixed here."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {requests.map((r) => {
            const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING;
            const date = new Date(`${r.workDate}T00:00:00`);
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-slate-900">
                    {date.toLocaleDateString("en-LK", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
                    style={{ backgroundColor: style.fill, color: style.fg }}
                  >
                    {style.label}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{r.reason}</p>
                {r.status !== "PENDING" && r.decisionNote ? (
                  <p className="mt-1.5 text-[12.5px] italic leading-relaxed text-slate-400">
                    &ldquo;{r.decisionNote}&rdquo;
                  </p>
                ) : null}
                {r.status === "PENDING" ? (
                  <button
                    type="button"
                    onClick={() => void withdraw(r.id)}
                    disabled={withdrawing === r.id}
                    className="mt-2.5 min-h-9 rounded-lg border border-slate-200 px-3 text-[12.5px] font-semibold text-slate-500 disabled:opacity-60"
                  >
                    {withdrawing === r.id ? "Withdrawing…" : "Withdraw"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
