"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  ApiRequestError,
  cancelBooking,
  fetchAvailability,
  fetchBookingByReference,
  rescheduleBooking,
  type AvailabilitySlot,
  type BookingDetail,
} from "../../../lib/api-client";
import {
  colomboToday,
  formatDateLong,
  formatDurationMin,
  formatPriceCents,
  formatTime,
  statusLabel,
} from "../../../lib/format";
import { BusyLabel } from "../../../components/spinner";

const NOT_CANCELLABLE_STATUSES = new Set([
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
  "EXPIRED",
  "COMPLETED",
]);

export default function ManageBookingPage() {
  const params = useParams<{ reference: string }>();
  const reference = params.reference;

  const [phone, setPhone] = useState("");
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refundedCents, setRefundedCents] = useState<number | null>(null);

  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(colomboToday());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBookingByReference(reference, phone.trim());
      setBooking(result);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? "We couldn't find a booking with that reference and phone number."
          : "Something went wrong. Please try again.",
      );
      setBooking(null);
    } finally {
      setLoading(false);
    }
  }

  async function submitCancel(): Promise<void> {
    if (!booking) {
      return;
    }
    setCancelling(true);
    setCancelError(null);
    const previousAdvancePaid = booking.advancePaidCents;
    try {
      const updated = await cancelBooking(reference, phone.trim(), cancelReason.trim());
      setBooking(updated);
      setRefundedCents(previousAdvancePaid - updated.advancePaidCents);
      setShowCancelForm(false);
    } catch (err) {
      setCancelError(
        err instanceof ApiRequestError
          ? err.message
          : "Could not cancel this booking. Please try again or call the salon.",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function loadRescheduleSlots(date: string): Promise<void> {
    if (!booking) {
      return;
    }
    setRescheduleDate(date);
    setLoadingSlots(true);
    setRescheduleError(null);
    try {
      const res = await fetchAvailability(booking.salonSlug, {
        serviceIds: booking.lines.map((l) => l.serviceId).filter((id): id is string => Boolean(id)),
        staffId: booking.staff.id,
        date,
      });
      setSlots(res.slots);
    } catch (err) {
      setRescheduleError(
        err instanceof ApiRequestError ? err.message : "Could not load availability.",
      );
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function submitReschedule(slot: AvailabilitySlot): Promise<void> {
    if (!booking) {
      return;
    }
    setRescheduling(true);
    setRescheduleError(null);
    try {
      const updated = await rescheduleBooking(reference, {
        phone: phone.trim(),
        newStart: slot.start,
        newStaffId: slot.staffId,
      });
      setBooking(updated);
      setShowRescheduleForm(false);
      setSlots([]);
    } catch (err) {
      setRescheduleError(
        err instanceof ApiRequestError
          ? err.message
          : "Could not reschedule this booking. Please try again or call the salon.",
      );
    } finally {
      setRescheduling(false);
    }
  }

  const cancellable = booking ? !NOT_CANCELLABLE_STATUSES.has(booking.status) : false;

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="text-2xl font-bold text-slate-900">Manage your booking</h1>
      <p className="mt-1 text-sm text-slate-500">Reference: {reference}</p>

      {!booking ? (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Phone number used at booking
            <input
              data-testid="lookup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-md bg-teal-600 px-4 py-2 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={loading} busyText="Looking up…">
              View booking
            </BusyLabel>
          </button>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Status</p>
            <p data-testid="booking-status" className="font-semibold text-slate-900">
              {statusLabel(booking.status)}
            </p>
            <p className="mt-3 text-sm text-slate-500">When</p>
            <p className="font-medium text-slate-900">
              {formatTime(booking.startTime)} with {booking.staff.name}
            </p>
            <p className="mt-3 text-sm text-slate-500">Services</p>
            <ul className="text-sm text-slate-700">
              {booking.lines.map((line) => (
                <li key={line.id}>
                  {line.nameSnapshot} ({formatDurationMin(line.durationMinSnapshot)}) —{" "}
                  {formatPriceCents(line.priceCentsSnapshot)}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-semibold text-slate-900">
              {formatPriceCents(booking.totalCents)}
            </p>
            {booking.advancePaidCents > 0 ? (
              <p className="text-sm text-slate-600">
                Advance paid: {formatPriceCents(booking.advancePaidCents)}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">
              Balance due: {formatPriceCents(booking.balanceCents)}
            </p>
          </div>

          {refundedCents !== null ? (
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
              {refundedCents > 0
                ? `A refund of ${formatPriceCents(refundedCents)} will be issued.`
                : "No refund applies to this cancellation."}
            </div>
          ) : null}

          {!cancellable ? null : showCancelForm ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">Cancel this booking?</p>
              <p className="mt-1 text-xs text-red-700">
                Cancelling within a few hours of your appointment may not be refundable — the salon
                will confirm.
              </p>
              <label className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
                Reason
                <input
                  data-testid="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-11 rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              {cancelError ? (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {cancelError}
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelForm(false)}
                  className="min-h-11 flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Never mind
                </button>
                <button
                  type="button"
                  data-testid="confirm-cancel"
                  disabled={cancelling || !cancelReason.trim()}
                  onClick={() => void submitCancel()}
                  className="min-h-11 flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <BusyLabel busy={cancelling} busyText="Cancelling…">
                    Confirm cancellation
                  </BusyLabel>
                </button>
              </div>
            </div>
          ) : null}

          {!cancellable ? null : showRescheduleForm ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Choose a new time</p>
              <input
                type="date"
                data-testid="reschedule-date"
                value={rescheduleDate}
                min={colomboToday()}
                onChange={(e) => void loadRescheduleSlots(e.target.value)}
                className="mt-2 min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">{formatDateLong(rescheduleDate)}</p>
              {loadingSlots ? (
                <p className="mt-2 text-sm text-slate-500">Loading times…</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No open slots on this date.</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={`${slot.staffId}-${slot.start}`}
                      type="button"
                      data-testid="reschedule-slot-option"
                      disabled={rescheduling}
                      onClick={() => void submitReschedule(slot)}
                      className="min-h-11 rounded-md border border-slate-200 px-2 py-2 text-sm hover:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              )}
              {rescheduleError ? (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {rescheduleError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowRescheduleForm(false)}
                className="mt-3 min-h-11 w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Never mind
              </button>
            </div>
          ) : null}

          {!showCancelForm && !showRescheduleForm ? (
            cancellable ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="open-reschedule"
                  onClick={() => {
                    setShowRescheduleForm(true);
                    void loadRescheduleSlots(rescheduleDate);
                  }}
                  className="min-h-11 flex-1 rounded-md border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  data-testid="open-cancel"
                  onClick={() => setShowCancelForm(true)}
                  className="min-h-11 flex-1 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                This booking can no longer be changed online. Please call the salon.
              </p>
            )
          ) : null}
        </div>
      )}
    </main>
  );
}
