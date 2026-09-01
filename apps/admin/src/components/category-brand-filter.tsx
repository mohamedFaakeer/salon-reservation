"use client";

/**
 * Quick Sale's category/brand filter row.
 *
 * Single-select, like the date-range presets: tapping a pill replaces
 * whatever was active, and "All items" is just another pill that clears it
 * back to `null` — there's no separate toggle-off gesture. Category and
 * brand share one flat row (that's what a cashier asked for), but a
 * category's active state uses the brand accent (teal) and a brand's uses a
 * dark pill instead, so the two axes stay visually distinguishable even
 * though they sit in the same line — plus a thin divider between the two
 * clusters. The row scrolls horizontally rather than wrapping: category and
 * brand are free text with no cap on how many a tenant ends up with, and
 * wrapping would push the product grid further down every time the catalog
 * grows.
 */
export type CategoryBrandFilter = { kind: "category" | "brand"; value: string } | null;

export function CategoryBrandFilterRow({
  categories,
  brands,
  value,
  onChange,
}: {
  categories: string[];
  brands: string[];
  value: CategoryBrandFilter;
  onChange: (next: CategoryBrandFilter) => void;
}) {
  // A brand-new tenant with nothing categorised yet has nothing to filter by
  // — rendering an empty row (just "All items", forever active) would be
  // clutter with no function.
  if (categories.length === 0 && brands.length === 0) {
    return null;
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter by category or brand"
    >
      <Pill active={value === null} onClick={() => onChange(null)}>
        All items
      </Pill>
      {categories.map((category) => (
        <Pill
          key={`category:${category}`}
          active={value?.kind === "category" && value.value === category}
          onClick={() => onChange({ kind: "category", value: category })}
        >
          {category}
        </Pill>
      ))}
      {categories.length > 0 && brands.length > 0 ? (
        <div aria-hidden="true" className="my-1.5 w-px shrink-0 bg-slate-300" />
      ) : null}
      {brands.map((brand) => (
        <Pill
          key={`brand:${brand}`}
          dark
          active={value?.kind === "brand" && value.value === brand}
          onClick={() => onChange({ kind: "brand", value: brand })}
        >
          {brand}
        </Pill>
      ))}
    </div>
  );
}

function Pill({
  active,
  dark,
  onClick,
  children,
}: {
  active: boolean;
  dark?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
        active
          ? dark
            ? "bg-slate-900 text-white"
            : "bg-teal-600 text-white"
          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
