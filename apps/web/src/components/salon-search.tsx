/**
 * Search by salon name or city.
 *
 * A real <form method="get"> rather than controlled state: it works before
 * hydration, survives a shared or reloaded URL, and keeps the results page
 * server-rendered. It straddles the seam between the dyed masthead and the
 * ground below it, which is what makes it read as the way in.
 */
export function SalonSearch({ defaultValue }: { defaultValue: string }) {
  return (
    <form action="/" method="get" role="search" className="relative z-10 -mt-7 px-5">
      <div className="flex items-center gap-2 rounded-full bg-[var(--resist)] py-1.5 pl-5 pr-1.5 shadow-[0_18px_36px_-18px_rgba(0,0,0,0.75)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
          <circle cx="7" cy="7" r="4.5" stroke="var(--ink)" strokeWidth="1.6" />
          <path d="m10.5 10.5 3 3" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Name or city"
          aria-label="Search salons by name or city"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base font-medium text-[var(--ink)] outline-none placeholder:text-[#6E7A55]"
        />
        {defaultValue ? (
          <a
            href="/"
            aria-label="Clear search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[rgba(18,48,44,0.08)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </a>
        ) : null}
        <button
          type="submit"
          aria-label="Search"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--dye-deep)] transition-colors duration-[var(--t-tap)] hover:bg-[var(--dye)]"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" stroke="var(--bloom)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
