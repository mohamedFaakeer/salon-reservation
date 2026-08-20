import { fetchSalons } from "../lib/api-client";
import { SalonList } from "../components/salon-list";
import { SalonSearch } from "../components/salon-search";

/**
 * Home (UX.md §3.2): search box over name and city, then the salon cards.
 *
 * The search is a plain GET form with the term in the URL, so it stays
 * server-rendered — the spec asks for "SSR fast", and a customer opening this
 * on a phone over mobile data should get results in the first response rather
 * than a shell that then fetches.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const salons = await fetchSalons(query);

  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="text-2xl font-bold text-slate-900">Book your salon visit</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a salon to see services and available times.
      </p>

      <div className="mt-5">
        <SalonSearch defaultValue={query} />
      </div>

      <div className="mt-5">
        {query ? (
          <p className="mb-3 text-sm text-slate-600">
            {salons.length} {salons.length === 1 ? "salon" : "salons"} matching &ldquo;{query}
            &rdquo;
          </p>
        ) : null}
        <SalonList salons={salons} query={query} />
      </div>
    </main>
  );
}
