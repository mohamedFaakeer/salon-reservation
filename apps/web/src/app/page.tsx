import { fetchSalons } from "../lib/api-client";
import { SalonList } from "../components/salon-list";

export default async function HomePage() {
  const salons = await fetchSalons();

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="text-2xl font-bold text-slate-900">Book your salon visit</h1>
      <p className="mt-1 text-sm text-slate-500">Pick a salon to see services and available times.</p>
      <div className="mt-6">
        <SalonList salons={salons} />
      </div>
    </main>
  );
}
