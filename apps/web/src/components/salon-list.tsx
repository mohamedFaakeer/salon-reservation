import Link from "next/link";
import type { SalonListItem } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { sceneFor } from "../lib/imagery";
import { DyedPhoto, Marker } from "./cloth";
import { EmptyState } from "./empty-state";

/**
 * Salon cards.
 *
 * The whole card is one dyed field with the photograph underneath it rather
 * than beside it — a thumbnail in a row would make this the same list every
 * booking product ships. "From Rs. 600" is the cheapest active service,
 * computed server-side; the three service names beside it are alphabetical and
 * must never be read as the source of that price.
 */
export function SalonList({ salons, query }: { salons: SalonListItem[]; query?: string }) {
  if (salons.length === 0) {
    return (
      <EmptyState
        title={
          query
            ? `Nothing open under "${query}". Try another name or city.`
            : "No salons are taking bookings yet — check back soon."
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {salons.map((salon, i) => (
        <li key={salon.slug} className="anim-rise" style={{ animationDelay: `${i * 70}ms` }}>
          <Link
            href={`/salon/${salon.slug}`}
            data-testid={`salon-card-${salon.slug}`}
            className="group relative flex min-h-[152px] items-end overflow-hidden rounded-[var(--radius)] bg-[var(--dye-mid)] transition-transform duration-[var(--t-state)] ease-[var(--ease)] hover:-translate-y-0.5"
          >
            <DyedPhoto src={sceneFor(salon.slug)} alt="" />
            <span className="relative w-full p-4">
              {salon.city ? (
                <Marker>{salon.city}</Marker>
              ) : salon.address ? (
                <Marker>{salon.address}</Marker>
              ) : null}
              <span className="display mt-1 block text-[26px] text-[var(--resist)]">
                {salon.name}
              </span>
              <span className="mt-2 flex items-end justify-between gap-3">
                <span className="min-w-0 text-[11.5px] text-[var(--resist-dim)]">
                  {salon.topServices.length > 0
                    ? salon.topServices.join(" · ") +
                      (salon.servicesCount > salon.topServices.length
                        ? ` +${salon.servicesCount - salon.topServices.length}`
                        : "")
                    : "No services listed yet"}
                </span>
                {salon.priceFromCents !== null ? (
                  <span className="display tabular shrink-0 text-[15px] text-[var(--dye)]">
                    From {formatPriceCents(salon.priceFromCents)}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
