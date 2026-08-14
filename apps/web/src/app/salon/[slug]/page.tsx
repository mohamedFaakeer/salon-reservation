import { notFound } from "next/navigation";
import { ApiRequestError, fetchSalonProfile } from "../../../lib/api-client";
import { BookingWizard } from "../../../components/booking-wizard";
import { formatDurationMin } from "../../../lib/format";

export default async function SalonProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const salon = await fetchSalonProfile(slug).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  });

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{salon.name}</h1>
        {salon.address ? <p className="mt-1 text-sm text-slate-500">{salon.address}</p> : null}
        <div className="mt-3 flex flex-col gap-1 text-sm text-slate-600">
          <p>{salon.advanceRuleLabel}</p>
          <p>{salon.cancellationPolicySummary}</p>
        </div>
        {salon.closures.length > 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {salon.closures.map((c, i) => (
              <p key={`${c.name}-${c.startDate}-${i}`}>
                Closed {c.startDate === c.endDate ? c.startDate : `${c.startDate} – ${c.endDate}`}: {c.name}
              </p>
            ))}
          </div>
        ) : null}
        {salon.services.length > 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            {salon.services.length} services · e.g. {formatDurationMin(salon.services[0].durationMin)} for{" "}
            {salon.services[0].name}
          </p>
        ) : null}
      </header>

      <BookingWizard salon={salon} />
    </main>
  );
}
