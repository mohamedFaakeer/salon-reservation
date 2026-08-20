import Link from "next/link";
import type { SalonListItem } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { EmptyState } from "./empty-state";

/**
 * Salon cards (UX.md §3.2): name, city, first three services, price-from.
 *
 * "From Rs. 900" is the cheapest active service, computed server-side. It is
 * the one number a customer can act on before opening the salon, and it must
 * never be guessed from the three names shown beside it — those are sorted
 * alphabetically, not by price.
 */
export function SalonList({ salons, query }: { salons: SalonListItem[]; query?: string }) {
  if (salons.length === 0) {
    return (
      <EmptyState
        title={
          query
            ? `No salons match "${query}". Try a different name or city.`
            : "No salons are open for booking right now — check back soon."
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {salons.map((salon) => (
        <li key={salon.slug}>
          <Link
            href={`/salon/${salon.slug}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal-500 hover:shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-base font-semibold text-slate-900">{salon.name}</p>
              {salon.priceFromCents !== null ? (
                <p className="shrink-0 text-sm font-medium text-teal-700">
                  From {formatPriceCents(salon.priceFromCents)}
                </p>
              ) : null}
            </div>

            {/* City is the thing a customer scans for; the full address is
                detail they only need once they have chosen. */}
            {salon.city ? (
              <p className="mt-0.5 text-sm text-slate-600">{salon.city}</p>
            ) : salon.address ? (
              <p className="mt-0.5 text-sm text-slate-500">{salon.address}</p>
            ) : null}

            {salon.topServices.length > 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {salon.topServices.join(" · ")}
                {salon.servicesCount > salon.topServices.length
                  ? ` + ${salon.servicesCount - salon.topServices.length} more`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No services listed yet</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
