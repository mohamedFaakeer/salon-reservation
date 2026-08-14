import type { SalonProfile } from "../lib/api-client";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatDurationMin, formatPriceCents } from "../lib/format";
import { EmptyState } from "./empty-state";

export function ServicePicker({ salon, wizard }: { salon: SalonProfile; wizard: BookingWizard }) {
  if (salon.services.length === 0) {
    return <EmptyState title="This salon has no bookable services right now." />;
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-slate-900">Choose services</h2>
      <p className="text-sm text-slate-500">Select one or more — you can combine services in one visit.</p>
      <ul className="mt-2 flex flex-col gap-2">
        {salon.services.map((service) => {
          const selected = wizard.selectedServiceIds.includes(service.id);
          return (
            <li key={service.id}>
              <button
                type="button"
                data-testid={`service-option-${service.id}`}
                onClick={() => wizard.toggleService(service.id)}
                aria-pressed={selected}
                className={`flex w-full min-h-11 items-center justify-between rounded-lg border p-3 text-left transition ${
                  selected ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span>
                  <span className="block font-medium text-slate-900">{service.name}</span>
                  <span className="block text-sm text-slate-500">{formatDurationMin(service.durationMin)}</span>
                </span>
                <span className="font-semibold text-slate-900">{formatPriceCents(service.priceCents)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
