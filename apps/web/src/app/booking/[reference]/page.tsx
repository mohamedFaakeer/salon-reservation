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
import { RateVisit } from "../../../components/rate-visit";

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
    <main className="mx-auto min-h-screen max-w-lg px-5 pb-16 pt-8">
      <h1 className="text-2xl font-bold text-[var(--resist)]">Manage your booking</h1>
      <p className="mt-1 text-[13px] text-[var(--resist-dim)]">Reference: {reference}</p>

      {!booking ? (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-[var(--resist)]">
            Phone number used at booking
            <input
              data-testid="lookup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.24)] bg-transparent px-3.5 text-[15px] text-[var(--resist)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--bloom)]"
            />
          </label>
          {error ? (
            <p role="alert" className="text-[13px] font-semibold text-[#E4867F]">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="min-h-12 cursor-pointer rounded-full bg-[var(--dye)] px-6 text-sm font-bold text-[#022B27] transition-colors duration-[var(--t-tap)] hover:bg-[var(--dye-press)] disabled:cursor-not-allowed disabled:bg-[var(--dye-mid)] disabled:text-[var(--resist-dim)]"
          >
            <BusyLabel busy={loading} busyText="Looking up…">
              View booking
            </BusyLabel>
          </button>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {/* Only a finished visit can be rated. The server refuses anything
              else; this keeps the invitation from appearing before there is
              something to have an opinion about.

              RateVisit owns its own submitted state and shows the thank-you
              itself, so it must not be unmounted the moment the rating lands —
              doing that made the whole block vanish with no confirmation, which
              reads as the tap having failed. */}
          {booking.status === "COMPLETED" ? (
            <RateVisit reference={reference} phone={phone} existing={booking.rating ?? null} />
          ) : null}

          <div className="rounded-[var(--radius)] border border-[rgba(240,231,214,0.16)] p-4">
            <p className="text-[13px] text-[var(--resist-dim)]">Status</p>
            <p data-testid="booking-status" className="font-bold text-[var(--resist)]">
              {statusLabel(booking.status)}
            </p>
            <p className="mt-3 text-[13px] text-[var(--resist-dim)]">When</p>
            <p className="font-bold text-[var(--resist)]">
              {formatTime(booking.startTime)} with {booking.staff.name}
            </p>
            <p className="mt-3 text-[13px] text-[var(--resist-dim)]">Services</p>
            <ul className="text-[13px] text-[var(--resist)]">
              {booking.lines.map((line) => (
                <li key={line.id}>
                  {line.nameSnapshot} ({formatDurationMin(line.durationMinSnapshot)}) —{" "}
                  {formatPriceCents(line.priceCentsSnapshot)}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-bold text-[var(--resist)]">
              {formatPriceCents(booking.totalCents)}
            </p>
            {booking.advancePaidCents > 0 ? (
              <p className="text-[13px] text-[var(--resist-dim)]">
                Advance paid: {formatPriceCents(booking.advancePaidCents)}
              </p>
            ) : null}
            <p className="text-[13px] text-[var(--resist-dim)]">
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
              <label className="mt-2 flex flex-col gap-1 text-[13px] text-[var(--resist)]">
                Reason
                <input
                  data-testid="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.24)] bg-transparent px-3.5 text-[15px] text-[var(--resist)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--bloom)]"
                />
              </label>
              {cancelError ? (
                <p role="alert" className="mt-2 text-[13px] font-semibold text-[#E4867F]">
                  {cancelError}
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelForm(false)}
                  className="min-h-12 flex-1 cursor-pointer rounded-full border-[1.5px] border-[rgba(240,231,214,0.28)] px-4 text-sm font-bold text-[var(--resist)] transition-colors duration-[var(--t-tap)] hover:border-[var(--bloom)]"
                >
                  Never mind
                </button>
                <button
                  type="button"
                  data-testid="confirm-cancel"
                  disabled={cancelling || !cancelReason.trim()}
                  onClick={() => void submitCancel()}
                  className="min-h-12 flex-1 cursor-pointer rounded-full bg-[#B3261E] px-4 text-sm font-bold text-[var(--resist)] transition-colors duration-[var(--t-tap)] hover:bg-[#8C1D18] disabled:cursor-not-allowed disabled:bg-[var(--dye-mid)] disabled:text-[var(--resist-dim)]"
                >
                  <BusyLabel busy={cancelling} busyText="Cancelling…">
                    Confirm cancellation
                  </BusyLabel>
                </button>
              </div>
            </div>
          ) : null}

          {!cancellable ? null : showRescheduleForm ? (
            <div className="rounded-[var(--radius)] border border-[rgba(240,231,214,0.16)] p-4">
              <p className="text-sm font-bold text-[var(--resist)]">Choose a new time</p>
              <input
                type="date"
                data-testid="reschedule-date"
                value={rescheduleDate}
                min={colomboToday()}
                onChange={(e) => void loadRescheduleSlots(e.target.value)}
                className="mt-2 min-h-12 rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.24)] bg-transparent px-3.5 text-[15px] text-[var(--resist)] outline-none transition-colors duration-[var(--t-tap)] focus:border-[var(--bloom)] text-sm"
              />
              <p className="mt-1 text-[11px] text-[var(--resist-dim)]">{formatDateLong(rescheduleDate)}</p>
              {loadingSlots ? (
                <p className="mt-2 text-[13px] text-[var(--resist-dim)]">Loading times…</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-[13px] text-[var(--resist-dim)]">No open slots on this date.</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={`${slot.staffId}-${slot.start}`}
                      type="button"
                      data-testid="reschedule-slot-option"
                      disabled={rescheduling}
                      onClick={() => void submitReschedule(slot)}
                      className="min-h-12 cursor-pointer rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.2)] px-2 text-sm transition-colors duration-[var(--t-tap)] hover:border-[var(--bloom)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              )}
              {rescheduleError ? (
                <p role="alert" className="mt-2 text-[13px] font-semibold text-[#E4867F]">
                  {rescheduleError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowRescheduleForm(false)}
                className="mt-3 min-h-12 w-full cursor-pointer rounded-full border-[1.5px] border-[rgba(240,231,214,0.28)] px-4 text-sm font-bold text-[var(--resist)] transition-colors duration-[var(--t-tap)] hover:border-[var(--bloom)]"
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
                  className="flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[var(--dye)] px-4 text-sm font-bold text-[var(--bloom)] transition-colors duration-[var(--t-tap)] hover:bg-[var(--dye-mid)]"
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
              <p className="text-[13px] text-[var(--resist-dim)]">
                This booking can no longer be changed online. Please call the salon.
              </p>
            )
          ) : null}
        </div>
      )}
    </main>
  );
}
