import React from "react";
import { useInitialSalonLoad, type BookingSource } from "../hooks/useBooking";
import { SalonBrief } from "../lib/api-client";

export function SalonList(): React.JSX.Element {
  const { salons, loadingSalon, salonError } = useInitialSalonLoad();

  if (loadingSalon) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-slate-500">Loading salons...</p>
      </main>
    );
  }

  if (salonError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <p className="text-red-500">Error: {salonError}</p>
        <p className="text-sm text-slate-400">
          <a href="/">Go back home</a>
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold text-slate-900">Choose a Salon</h1>
      <p className="text-center text-slate-500">
        Browse salons near you and book an appointment.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl w-full">
        {salons.map((salon: SalonBrief) => (
          <div
            key={salon.slug}
            className="group rounded-lg border border-slate-300 hover:border-primary-500 transition-colors cursor-pointer"
            onClick={() => window.location.href = `/salon/${salon.slug}`}
          >
            <div className="p-4">
              <h3 className="text-semibold text-slate-700 group-hover:text-primary-600 transition-colors">
                {salon.name}
              </h3>
              {salon.city && (
                <p className="text-sm text-slate-500 mb-2">{salon.city}</p>
              )}
              {salon.servicesSummary && (
                <p className="text-xs text-slate-400 mb-2">{salon.servicesSummary}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}