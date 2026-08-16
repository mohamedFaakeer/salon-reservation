import Link from "next/link";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatDurationMin, formatPriceCents, formatTime } from "../lib/format";

export function SuccessScreen({ wizard }: { wizard: BookingWizard }) {
  if (!wizard.confirmed) {
    return null;
  }
  const { appointment, bookingReference } = wizard.confirmed;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-3xl text-teal-700">
        ✓
      </div>
      <h2 className="text-xl font-semibold text-slate-900">You&apos;re booked!</h2>

      <div className="w-full rounded-lg border border-teal-200 bg-teal-50 p-4">
        <p className="text-sm text-teal-700">Your booking reference</p>
        <p
          data-testid="booking-reference"
          className="text-2xl font-bold tracking-wide text-teal-900"
        >
          {bookingReference}
        </p>
        <p className="mt-1 text-xs text-teal-700">
          Keep this — you&apos;ll need it to manage your booking.
        </p>
      </div>

      <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left text-sm text-slate-700">
        <p>
          <span className="font-medium">{formatTime(appointment.startTime)}</span> with{" "}
          {appointment.staff.name}
        </p>
        <p className="mt-1 text-slate-500">
          {appointment.lines.map((l) => l.nameSnapshot).join(", ")} ·{" "}
          {formatDurationMin(wizard.totalDurationMin)}
        </p>
        <p className="mt-2 font-semibold text-slate-900">
          {formatPriceCents(appointment.totalCents)}
        </p>
        {appointment.advancePaidCents > 0 ? (
          <p className="mt-1 text-slate-600">
            Advance paid: {formatPriceCents(appointment.advancePaidCents)}
          </p>
        ) : null}
        <p className="text-slate-600">
          Balance due at the salon: {formatPriceCents(appointment.balanceCents)}
        </p>
      </div>

      <p className="text-xs text-slate-500">A confirmation will be sent to you shortly.</p>

      <Link
        href={`/booking/${bookingReference}`}
        className="min-h-11 rounded-md border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
      >
        View my booking
      </Link>
    </div>
  );
}
