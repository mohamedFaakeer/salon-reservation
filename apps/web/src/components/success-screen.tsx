import Link from "next/link";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import type { SalonProfile } from "../lib/api-client";
import { formatDurationMin, formatPriceCents, formatTime, getDirectionsUrl } from "../lib/format";
import { DyeButton, Marker } from "./cloth";

/**
 * Booked.
 *
 * The reference code is the artifact the customer leaves with — it is their
 * only credential, and they will read it down a phone line. So it is the
 * largest thing on the screen, set in tabular figures, letter-spaced, and
 * hyphenated the way it was issued.
 *
 * The seal blooms once and stops. Nothing on a confirmation screen should keep
 * moving after it has been read.
 */
export function SuccessScreen({ wizard, salon }: { wizard: BookingWizard; salon: SalonProfile }) {
  if (!wizard.confirmed) {
    return null;
  }
  const { appointment, bookingReference } = wizard.confirmed;

  return (
    <div className="-mx-5 -mt-6">
      <div className="crackle relative overflow-hidden bg-[var(--dye-deep)] px-5 pb-8 pt-10 text-center text-[var(--resist)]">
        <span
          aria-hidden="true"
          className="anim-bloom mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[radial-gradient(circle_at_34%_30%,var(--bloom),var(--dye)_46%,#08635B)] shadow-[0_22px_46px_-18px_var(--dye)]"
        >
          <svg width="42" height="42" viewBox="0 0 16 16" fill="none">
            <path
              d="M3.4 8.4 6.4 11.4 12.6 5"
              stroke="#022B27"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h2 className="display display-wide mt-5 text-[clamp(30px,9vw,38px)]">
          The chair
          <span className="block text-[var(--dye)]">is yours.</span>
        </h2>
        <p className="tabular mt-2.5 text-[13px] text-[var(--resist-dim)]">
          {formatTime(appointment.startTime)} with {appointment.staff.name}
        </p>

        <div className="mt-6 rounded-[var(--radius)] border-[1.6px] border-dashed border-[rgba(123,227,208,0.5)] p-4">
          <Marker>Your reference</Marker>
          <p
            data-testid="booking-reference"
            className="display display-wide tabular mt-1 text-[clamp(30px,10vw,38px)] leading-none tracking-[0.05em] text-[var(--bloom)]"
          >
            {bookingReference}
          </p>
          <p className="mt-2 text-[11px] text-[var(--resist-dim)]">
            Read this out to change or cancel your booking
          </p>
        </div>

        <dl className="mt-5 text-left">
          <Row label="Services" value={appointment.lines.map((l) => l.nameSnapshot).join(", ")} />
          <Row label="Takes" value={formatDurationMin(wizard.totalDurationMin)} />
          <Row label="Total" value={formatPriceCents(appointment.totalCents)} tabular />
          {appointment.advancePaidCents > 0 ? (
            <Row label="Paid" value={formatPriceCents(appointment.advancePaidCents)} tabular />
          ) : null}
          <Row
            label="Due at the salon"
            value={formatPriceCents(appointment.balanceCents)}
            tabular
          />
        </dl>

        <Link href={`/booking/${bookingReference}`} className="mt-6 block">
          <DyeButton className="w-full">Manage this booking</DyeButton>
        </Link>
        {salon.latitude !== null && salon.longitude !== null ? (
          <a
            href={getDirectionsUrl(salon.latitude, salon.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-block min-h-11 py-2 text-[13px] font-semibold text-[var(--bloom)] underline decoration-[var(--dye)] decoration-2 underline-offset-4"
          >
            Get Directions to {salon.name}
          </a>
        ) : null}
        <p className="mt-3 text-[11px] text-[var(--resist-dim)]">
          We&apos;ll send a confirmation to your phone shortly.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, tabular = false }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[rgba(240,231,214,0.12)] py-3 text-[13px] last:border-b-0">
      <dt className="shrink-0 text-[var(--resist-dim)]">{label}</dt>
      <dd className={`text-right font-bold ${tabular ? "tabular" : ""}`}>{value}</dd>
    </div>
  );
}
