"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  decideAttendanceEditRequest,
  fetchAttendanceEditRequests,
  type AttendanceEditRequestStatus,
  type AttendanceEditRequestView,
} from "../../../../lib/api-client";
import { errorCopy } from "../../../../lib/error-copy";
import { formatTime } from "../../../../lib/format";
import { useToast } from "../../../../components/toast";
import { ListSkeleton } from "../../../../components/loading-skeleton";
import { EmptyState } from "../../../../components/empty-state";
import { ModuleGate } from "../../../../components/module-gate";

const TABS: Array<{ value: AttendanceEditRequestStatus | "ALL"; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "ALL", label: "All" },
];

export default function AttendanceRequestsPageGated() {
  return (
    <ModuleGate module="attendance" label="Attendance">
      <AttendanceRequestsPage />
    </ModuleGate>
  );
}

function AttendanceRequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<AttendanceEditRequestStatus | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AttendanceEditRequestView[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function load(): void {
    setLoading(true);
    fetchAttendanceEditRequests(tab === "ALL" ? {} : { status: tab })
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, [tab]);

  async function decide(id: string, status: "APPROVED" | "REJECTED", decisionNote?: string): Promise<void> {
    setDecidingId(id);
    try {
      await decideAttendanceEditRequest(id, { status, note: decisionNote });
      toast.success(status === "APPROVED" ? "Correction approved" : "Request declined");
      setDecliningId(null);
      setNote("");
      load();
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Correction requests</h1>
          <p className="text-sm text-slate-500">The reason is always shown before a decision.</p>
        </div>
        <Link href="/attendance" className="text-sm font-medium text-teal-700 hover:underline">
          ← Back to board
        </Link>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`min-h-9 rounded-full px-3.5 text-sm font-medium ${
              tab === t.value ? "bg-teal-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState title={tab === "PENDING" ? "Nothing waiting on a decision." : "No requests to show."} />
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => {
            const date = new Date(`${r.workDate}T00:00:00`);
            const pending = r.status === "PENDING";
            return (
              <div key={r.id} className="rounded border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {r.staffName} ·{" "}
                    {date.toLocaleDateString("en-LK", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <StatusPill status={r.status} />
                </div>

                <div className="mt-2.5 flex flex-wrap gap-6 text-xs">
                  {r.requestedCheckInAt ? (
                    <Diff label="Check-in" from={r.previousCheckInAt} to={r.requestedCheckInAt} />
                  ) : null}
                  {r.requestedCheckOutAt ? (
                    <Diff label="Check-out" from={r.previousCheckOutAt} to={r.requestedCheckOutAt} />
                  ) : null}
                </div>

                <p className="mt-2.5 rounded bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600">
                  &ldquo;{r.reason}&rdquo;
                </p>

                {!pending && r.decisionNote ? (
                  <p className="mt-2 text-xs italic text-slate-400">Manager's note: &ldquo;{r.decisionNote}&rdquo;</p>
                ) : null}

                {pending ? (
                  decliningId === r.id ? (
                    <div className="mt-3 flex flex-col gap-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Why? (shown to them)"
                        rows={2}
                        className="w-full resize-none rounded border border-slate-300 px-2.5 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={decidingId === r.id}
                          onClick={() => void decide(r.id, "REJECTED", note.trim() || undefined)}
                          className="min-h-9 rounded bg-slate-700 px-3 text-xs font-medium text-white disabled:opacity-60"
                        >
                          Confirm decline
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDecliningId(null);
                            setNote("");
                          }}
                          className="min-h-9 rounded border border-slate-300 px-3 text-xs font-medium text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={decidingId === r.id}
                        onClick={() => void decide(r.id, "APPROVED")}
                        className="min-h-9 rounded bg-teal-600 px-3.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={decidingId === r.id}
                        onClick={() => setDecliningId(r.id)}
                        className="min-h-9 rounded border border-slate-300 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Diff({ label, from, to }: { label: string; from: string | null; to: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="tabular">
        <span className="text-slate-400 line-through">{from ? formatTime(from) : "not recorded"}</span>{" "}
        <span className="text-slate-300">→</span> <span className="font-semibold text-slate-900">{formatTime(to)}</span>
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: AttendanceEditRequestStatus }) {
  const style: Record<AttendanceEditRequestStatus, { fill: string; fg: string; label: string }> = {
    PENDING: { fill: "#FEF3C7", fg: "#92400E", label: "Pending" },
    APPROVED: { fill: "#D1FAE5", fg: "#065F46", label: "Approved" },
    REJECTED: { fill: "#E2E8F0", fg: "#475569", label: "Declined" },
    WITHDRAWN: { fill: "#E2E8F0", fg: "#94A3B8", label: "Withdrawn" },
  };
  const s = style[status];
  return (
    <span className="shrink-0 rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: s.fill, color: s.fg }}>
      {s.label}
    </span>
  );
}
