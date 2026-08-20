"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ServiceItem } from "../lib/api-client";
import { formatDurationMin, formatPriceCents } from "../lib/format";

/**
 * Multi-select services by typing.
 *
 * A salon with forty services turns a plain list into scrolling, and the
 * receptionist already knows the name — so the field opens on the three most
 * common and gets out of the way the moment they start typing.
 *
 * "Top 3" is the three shortest active services, which in a salon are the
 * quick, high-frequency ones — a trim, a wash, a beard. That is a display
 * heuristic and nothing else depends on it; the full list is one keystroke
 * away, and everything selected is confirmed as a chip.
 *
 * Built to the ARIA combobox pattern rather than a styled div: the input owns
 * `role="combobox"`, the list is a `listbox`, and the active option is tracked
 * with `aria-activedescendant` so focus never leaves the input and typing
 * never breaks.
 */
export function ServiceCombobox({
  services,
  selectedIds,
  onToggle,
}: {
  services: ServiceItem[];
  selectedIds: string[];
  onToggle: (serviceId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const bookable = useMemo(() => services.filter((s) => s.active), [services]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Shortest first: the quick services are the ones booked most often.
      return [...bookable].sort((a, b) => a.durationMin - b.durationMin).slice(0, 3);
    }
    return bookable.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q),
    );
  }, [bookable, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const selected = selectedIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is ServiceItem => Boolean(s));

  function choose(service: ServiceItem): void {
    onToggle(service.id);
    setQuery("");
    // Stays open: booking a cut and a colour together is normal, and closing
    // after every pick would make the second one a fresh hunt.
    setActiveIndex(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + matches.length) % Math.max(matches.length, 1);
      });
      return;
    }
    if (e.key === "Enter" && open && matches[activeIndex]) {
      e.preventDefault();
      choose(matches[activeIndex]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    // Backspace on an empty field removes the last chip — the behaviour every
    // tag input has, and the fastest way to undo a mis-tap.
    if (e.key === "Backspace" && query === "" && selected.length > 0) {
      onToggle(selected[selected.length - 1].id);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={`${listId}-input`} className="mb-1.5 block text-sm font-medium text-slate-700">
        Services
      </label>

      {selected.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                data-testid={`drawer-service-chip-${service.id}`}
                onClick={() => onToggle(service.id)}
                aria-label={`Remove ${service.name}`}
                className="flex min-h-8 items-center gap-1.5 rounded-full bg-teal-600 py-1 pl-3 pr-2 text-xs font-medium text-white hover:bg-teal-700"
              >
                {service.name}
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={`${listId}-input`}
        data-testid="service-combobox"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={selected.length > 0 ? "Add another…" : "Search services…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
      />

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Services"
            className="max-h-64 overflow-y-auto py-1"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-slate-500">
                Nothing matches &ldquo;{query.trim()}&rdquo;.
              </li>
            ) : (
              matches.map((service, i) => {
                const isSelected = selectedIds.includes(service.id);
                return (
                  <li
                    key={service.id}
                    id={`${listId}-${service.id}`}
                    role="option"
                    aria-selected={isSelected}
                    data-testid={`drawer-service-${service.id}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(service);
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm ${
                      i === activeIndex ? "bg-slate-100" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={isSelected ? "font-semibold text-teal-700" : "text-slate-900"}>
                        {service.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDurationMin(service.durationMin)}
                        {service.category ? ` · ${service.category}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular text-slate-700">
                      {formatPriceCents(service.priceCents)}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
          {!query.trim() && bookable.length > matches.length ? (
            <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Showing the {matches.length} quickest — type to search all {bookable.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
