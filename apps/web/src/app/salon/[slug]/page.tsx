import { notFound } from "next/navigation";
import { ApiRequestError, fetchSalonProfile } from "../../../lib/api-client";
import { BookingWizard } from "../../../components/booking-wizard";
import { SalonHours } from "../../../components/salon-hours";
import { StaffGrid } from "../../../components/staff-grid";
import { DyedPhoto, Marker, Undyed } from "../../../components/cloth";
import { formatDateLong } from "../../../lib/format";
import { sceneFor } from "../../../lib/imagery";

/**
 * The salon.
 *
 * The name soaks in over the photograph — the one authored motion moment on
 * this screen — and everything below it is cloth pulled out of the bath, where
 * reading matters more than atmosphere.
 *
 * `advanceRuleLabel` and `cancellationPolicySummary` arrive from the server as
 * finished customer-facing sentences. They are printed verbatim: composing our
 * own version here would be a second place the refund policy lives.
 */
export default async function SalonProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const salon = await fetchSalonProfile(slug).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  });

  const place = [salon.city, salon.address].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto min-h-screen max-w-lg">
      <header className="crackle relative overflow-hidden bg-[var(--dye-deep)] px-5 pb-7 pt-6">
        <DyedPhoto src={sceneFor(salon.slug)} alt="" position="center 28%" drift />
        <div className="relative z-10">
          <h1 className="display display-wide anim-soak text-[clamp(38px,11vw,48px)] text-[var(--resist)]">
            {salon.name}
          </h1>
          {place ? (
            <p className="mt-2 text-[13px] text-[var(--bloom)]">{place}</p>
          ) : null}
          {salon.phone ? (
            <a
              href={`tel:${salon.phone}`}
              className="mt-1 inline-block min-h-11 py-2 text-[13px] font-semibold text-[var(--resist)] underline decoration-[var(--dye)] decoration-2 underline-offset-4"
            >
              {salon.phone}
            </a>
          ) : null}
        </div>
      </header>

      {/* The two rules that decide what a booking costs to make and to break.
          Stated before the wizard, not at the payment step where someone has
          already spent five taps. */}
      <section className="bg-[var(--dye-deep)] px-5 pb-6">
        <ul className="border-t border-[rgba(240,231,214,0.14)]">
          <li className="flex gap-3 border-b border-[rgba(240,231,214,0.14)] py-3.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="6.2" stroke="var(--bloom)" strokeWidth="1.4" />
              <path d="M8 4.8V8l2.1 1.3" stroke="var(--bloom)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <p className="text-[13px] font-bold text-[var(--resist)]">{salon.advanceRuleLabel}</p>
          </li>
          <li className="flex gap-3 py-3.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
              <path d="M3.4 8.4 6.4 11.4 12.6 5" stroke="var(--bloom)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[13px] font-bold text-[var(--resist)]">
              {salon.cancellationPolicySummary}
            </p>
          </li>
        </ul>

        {salon.closures.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--alarm)] p-3">
            <Marker>Closed dates</Marker>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-[var(--resist)]">
              {salon.closures.map((c, i) => (
                <li key={`${c.name}-${c.startDate}-${i}`} className="tabular">
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
      </section>

      <Undyed className="min-h-[60vh] rounded-t-[var(--radius)] pb-24">
        <StaffGrid staff={salon.staff} />
        <SalonHours hours={salon.hours} />
        <BookingWizard salon={salon} />
      </Undyed>
    </main>
  );
}
