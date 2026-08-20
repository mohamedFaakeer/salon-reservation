import { notFound } from "next/navigation";
import { ApiRequestError, fetchSalonProfile } from "../../../lib/api-client";
import { BookingWizard } from "../../../components/booking-wizard";
import { SalonHours } from "../../../components/salon-hours";
import { StaffGrid } from "../../../components/staff-grid";
import { formatDateLong } from "../../../lib/format";

export default async function SalonProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const salon = await fetchSalonProfile(slug).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  });

  const location = [salon.city, salon.address].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{salon.name}</h1>
        {location ? <p className="mt-1 text-sm text-slate-500">{location}</p> : null}
        {salon.phone ? (
          <p className="mt-0.5 text-sm text-slate-500">
            <a href={`tel:${salon.phone}`} className="text-teal-700 hover:underline">
              {salon.phone}
            </a>
          </p>
        ) : null}

        {/* The two rules that decide what a booking costs to make and to
            break. Stated before the wizard rather than at the payment step,
            where a customer has already invested five taps. */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Before you book
          </p>
          <p className="mt-1.5 text-sm text-slate-800">{salon.advanceRuleLabel}</p>
          <p className="mt-0.5 text-sm text-slate-700">{salon.cancellationPolicySummary}</p>
        </div>

        {salon.closures.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-800">
              Closed dates
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-amber-900">
              {salon.closures.map((c, i) => (
                <li key={`${c.name}-${c.startDate}-${i}`}>
                  {c.startDate === c.endDate
                    ? formatDateLong(c.startDate)
                    : `${formatDateLong(c.startDate)} – ${formatDateLong(c.endDate)}`}
                  {" — "}
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <StaffGrid staff={salon.staff} />
        <SalonHours hours={salon.hours} />
      </header>

      <BookingWizard salon={salon} />
    </main>
  );
}
