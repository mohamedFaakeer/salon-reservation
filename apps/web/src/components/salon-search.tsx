/**
 * Search by salon name or city.
 *
 * A real <form method="get"> rather than a controlled input: it works before
 * hydration, survives a shared or reloaded URL, and leaves the result page
 * server-rendered. Nothing here needs client state.
 */
export function SalonSearch({ defaultValue }: { defaultValue: string }) {
  return (
    <form action="/" method="get" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search by name or city…"
        aria-label="Search salons by name or city"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base"
      />
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
      >
        Search
      </button>
      {defaultValue ? (
        <a
          href="/"
          className="flex min-h-11 shrink-0 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </a>
      ) : null}
    </form>
  );
}
