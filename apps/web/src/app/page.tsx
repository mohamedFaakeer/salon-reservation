import { fetchSalons } from "../lib/api-client";
import { AccountHeaderButton } from "../components/account-header-button";
import { SalonList } from "../components/salon-list";
import { SalonSearch } from "../components/salon-search";

/**
 * Home.
 *
 * The masthead is one saturated dye field carrying the whole first viewport,
 * with the search bar straddling the seam where the dye ends. Search stays a
 * plain GET form so results are server-rendered — the spec asks for sixty
 * seconds to a booking, and a shell that then fetches spends the first four.
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
    <main className="mx-auto min-h-screen max-w-lg pb-16">
      <header className="crackle relative overflow-hidden bg-[linear-gradient(168deg,var(--dye)_0%,var(--dye-press)_44%,var(--dye-deep)_100%)] px-5 pb-10 pt-6">
        <div className="relative z-10 flex items-center justify-between">
          <span className="display display-wide text-[15px] tracking-[0.02em] text-[#022B27]">
            Salon
          </span>
          <div className="flex items-center gap-2">
            <AccountHeaderButton />
            <a
              href="/booking"
              className="min-h-11 rounded-full border-[1.4px] border-[rgba(2,43,39,0.35)] px-4 py-2 text-[11px] font-semibold text-[#022B27] transition-colors duration-[var(--t-tap)] hover:bg-[rgba(2,43,39,0.1)]"
            >
              My booking
            </a>
          </div>
        </div>

        <h1 className="display display-wide relative z-10 mt-9 text-[clamp(44px,13vw,56px)] text-[#022B27]">
          Claim
          <span className="block text-[var(--resist)]">the chair.</span>
        </h1>
        <p className="relative z-10 mt-3 max-w-[19rem] text-[13.5px] font-medium text-[var(--resist)]">
          Every time you see is a time you can take. Nothing greyed out, no account, no phone call.
        </p>
      </header>

      <SalonSearch defaultValue={query} />

      <section className="mt-7 px-5">
        <h2 className="display text-[26px] text-[var(--resist)]">
          {query ? (
            <>
              {salons.length} {salons.length === 1 ? "match" : "matches"}
            </>
          ) : (
            <>
              Open
              <span className="block">near you</span>
            </>
          )}
        </h2>
        <div className="mt-4">
          <SalonList salons={salons} query={query} />
        </div>
      </section>
    </main>
  );
}
