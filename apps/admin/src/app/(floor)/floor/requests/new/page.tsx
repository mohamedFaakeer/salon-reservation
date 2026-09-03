"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { fetchMyAttendance, requestAttendanceEdit } from "../../../../../lib/api-client";
import { errorCopy } from "../../../../../lib/error-copy";
import { todayLocalDate } from "../../../../../lib/format";
import { useToast } from "../../../../../components/toast";
import { BusyLabel } from "../../../../../components/spinner";
import { TOUR_ANCHORS } from "../../../../../lib/tour-anchors";

export default function NewCorrectionRequestPage() {
  return (
    // useSearchParams needs a Suspense boundary in the App Router; the fallback
    // never actually shows since this route only ever renders client-side.
    <Suspense fallback={null}>
      <NewCorrectionRequestForm />
    </Suspense>
  );
}

function NewCorrectionRequestForm() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const initialDate = params.get("date") ?? todayLocalDate();

  const [workDate, setWorkDate] = useState(initialDate);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingDay, setLoadingDay] = useState(true);

  // Prefill from whatever is already on record for that day, so correcting
  // one end of a shift doesn't require re-typing the end that was already
  // right.
  useEffect(() => {
    setLoadingDay(true);
    fetchMyAttendance({ from: workDate, to: workDate })
      .then((report) => {
        const row = report.days[0];
        setCheckIn(row?.checkInAt ? toLocalTimeInput(row.checkInAt) : "");
        setCheckOut(row?.checkOutAt ? toLocalTimeInput(row.checkOutAt) : "");
      })
      .catch(() => undefined)
      .finally(() => setLoadingDay(false));
  }, [workDate]);

  async function submit(): Promise<void> {
    if (reason.trim().length < 3) {
      toast.error("Say why", "A short reason is required so your manager knows what to check.");
      return;
    }
    if (!checkIn && !checkOut) {
      toast.error("Nothing to correct", "Set at least one corrected time.");
      return;
    }
    setSubmitting(true);
    try {
      await requestAttendanceEdit({
        workDate,
        requestedCheckInAt: checkIn ? fromLocalTimeInput(workDate, checkIn) : undefined,
        requestedCheckOutAt: checkOut ? fromLocalTimeInput(workDate, checkOut) : undefined,
        reason: reason.trim(),
      });
      toast.success("Sent to your manager", "You'll see the outcome under Requests.");
      router.push("/floor/requests");
    } catch (err) {
      const copy = errorCopy(err);
      toast.error(copy.title, copy.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Request a correction</h1>
        <button
          type="button"
          onClick={() => router.push("/floor/requests")}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <Field label="Which day?" tourId={TOUR_ANCHORS.floorRequestForm.dayField}>
        <input
          type="date"
          value={workDate}
          max={todayLocalDate()}
          onChange={(e) => setWorkDate(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900"
        />
      </Field>

      <Field label="Corrected check-in" tourId={TOUR_ANCHORS.floorRequestForm.timeFields}>
        <input
          type="time"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          disabled={loadingDay}
          className="tabular min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 disabled:opacity-50"
        />
      </Field>

      <Field label="Corrected check-out">
        <input
          type="time"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          disabled={loadingDay}
          className="tabular min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 disabled:opacity-50"
        />
      </Field>

      <Field label="Why?" tourId={TOUR_ANCHORS.floorRequestForm.reasonField}>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Phone died, forgot to check out before I left."
          rows={3}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] text-slate-900"
        />
      </Field>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        data-tour-id={TOUR_ANCHORS.floorRequestForm.sendButton}
        className="mt-1 min-h-[52px] w-full rounded-2xl bg-teal-600 text-[15px] font-bold text-white disabled:opacity-60"
      >
        <BusyLabel busy={submitting} busyText="Sending…">
          Send to manager
        </BusyLabel>
      </button>
    </div>
  );
}

function Field({
  label,
  tourId,
  children,
}: {
  label: string;
  tourId?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5" data-tour-id={tourId}>
      <span className="text-xs font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** `<input type="time">` wants local `HH:MM`, plucked from an ISO instant in Colombo terms. */
function toLocalTimeInput(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
}

/** The inverse: a `YYYY-MM-DD` + local `HH:MM` back into a real UTC instant. */
function fromLocalTimeInput(workDate: string, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const COLOMBO_OFFSET_MINUTES = 330;
  const utcMidnight = Date.parse(`${workDate}T00:00:00Z`);
  const instant = utcMidnight - COLOMBO_OFFSET_MINUTES * 60_000 + (h * 60 + m) * 60_000;
  return new Date(instant).toISOString();
}
