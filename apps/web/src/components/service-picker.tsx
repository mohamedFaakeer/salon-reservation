import type { SalonProfile } from "../lib/api-client";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatDurationMin, formatPriceCents } from "../lib/format";
import { describeOffer } from "../lib/offer";
import { EmptyState } from "./empty-state";

/**
 * Pick services.
 *
 * Selected rows go indigo — the second dye bath — because teal is reserved for
 * "bookable" and reusing it for "chosen" would put two meanings on one colour.
 * Multi-select is real: a cut and a colour are one visit, and the sticky bar
 * keeps the running total in view while you decide.
 */
export function ServicePicker({ salon, wizard }: { salon: SalonProfile; wizard: BookingWizard }) {
  if (salon.services.length === 0) {
    return <EmptyState title="This salon has no bookable services right now." />;
  }

  return (
    <div>
      <h2 className="display text-[28px] text-[var(--ink)]">
        Choose
        <span className="block">services</span>
      </h2>
      <p className="mt-1.5 text-[13px] text-[#5E6B60]">
        Pick as many as you want — they run back to back in one visit.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {salon.services.map((service) => {
          const selected = wizard.selectedServiceIds.includes(service.id);
          return (
            <li key={service.id}>
              <button
                type="button"
                data-testid={`service-option-${service.id}`}
                onClick={() => wizard.toggleService(service.id)}
                aria-pressed={selected}
                className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border-[1.5px] p-3.5 text-left transition-colors duration-[var(--t-tap)] ${
                  selected
                    ? "border-[var(--indigo)] bg-[var(--indigo)] text-[var(--resist)]"
                    : "border-[rgba(18,48,44,0.14)] bg-white/50 text-[var(--ink)] hover:border-[rgba(18,48,44,0.3)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-md border-[1.6px] ${
                    selected ? "border-[var(--bloom)] bg-[var(--bloom)]" : "border-[rgba(18,48,44,0.3)]"
                  }`}
                >
                  {selected ? (
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M3.4 8.4 6.4 11.4 12.6 5" stroke="var(--indigo)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{service.name}</span>
                  <span className={`block text-[11px] ${selected ? "text-[var(--bloom)]" : "text-[#5E6B60]"}`}>
                    {formatDurationMin(service.durationMin)}
                  </span>
                  {/*
                    The offer takes no new colour. The legend gives --dye
                    "bookable", --indigo "selected" and --alarm the expiring
                    hold; a fourth meaning would break it. So the badge speaks
                    in resist — undyed cloth, ink type, carrying the crackle.
                    The crackle is where the wax broke and the full price did
                    not land.
                  */}
                  {service.discount ? (
                    <span className="offer-chip" data-testid={`service-offer-${service.id}`}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                        <path d="M2.5 8.5 7 13l6.5-9" />
                      </svg>
                      {service.discount.label}
                      <span className="offer-when">
                        · {describeOffer(service.discount)}
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  {service.discount ? (
                    <span
                      className={`block text-[11.5px] line-through decoration-[1.5px] tabular ${
                        selected ? "text-[var(--bloom)]" : "text-[#7D8A80]"
                      }`}
                    >
                      {formatPriceCents(service.priceCents)}
                    </span>
                  ) : null}
                  <span className="display tabular block text-[15px]">
                    {formatPriceCents(service.discount?.discountedPriceCents ?? service.priceCents)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
