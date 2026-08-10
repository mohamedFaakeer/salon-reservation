import React from "react";

export default function Home(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold text-slate-900">Salon Booking</h1>
      <p className="text-center text-slate-600">
        Book your salon appointment in under 60 seconds.
      </p>
      <p className="text-sm text-slate-400">
        Salon directory coming in Phase 11 — this page will list salons.
      </p>
    </main>
  );
}