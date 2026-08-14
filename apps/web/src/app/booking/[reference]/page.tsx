"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, fetchBookingByReference, type BookingDetail } from "../../../lib/api-client";
import { formatDurationMin, formatPriceCents, formatTime } from "../../../lib/format";

export default function ManageBookingPage() {
  const params = useParams<{ reference: string }>();
  const reference = params.reference;

  const [phone, setPhone] = useState("");
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-md bg-teal-600 px-4 py-2 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "Looking up…" : "View booking"}
          </button>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Status</p>
            <p data-testid="booking-status" className="font-semibold text-slate-900">
              {booking.status}
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
            <p className="mt-3 font-semibold text-slate-900">{formatPriceCents(booking.totalCents)}</p>
            {booking.advancePaidCents > 0 ? (
              <p className="text-sm text-slate-600">Advance paid: {formatPriceCents(booking.advancePaidCents)}</p>
            ) : null}
            <p className="text-sm text-slate-600">Balance due: {formatPriceCents(booking.balanceCents)}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="min-h-11 flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Reschedule (coming soon)
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="min-h-11 flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Cancel (coming soon)
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
