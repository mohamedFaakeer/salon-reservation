import Link from "next/link";
import type { SalonListItem } from "../lib/api-client";
import { EmptyState } from "./empty-state";

export function SalonList({ salons }: { salons: SalonListItem[] }) {
  if (salons.length === 0) {
    return <EmptyState title="No salons are open for booking right now — check back soon." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {salons.map((salon) => (
        <li key={salon.slug}>
          <Link
            href={`/salon/${salon.slug}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-teal-500 hover:shadow-sm"
          >
            <p className="text-base font-semibold text-slate-900">{salon.name}</p>
            {salon.address ? <p className="mt-1 text-sm text-slate-500">{salon.address}</p> : null}
            <p className="mt-1 text-sm text-teal-700">
              {salon.servicesCount} {salon.servicesCount === 1 ? "service" : "services"} available
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
