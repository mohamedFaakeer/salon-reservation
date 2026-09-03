"use client";

import { useEffect, useRef, useState } from "react";
import { useTour } from "../context/tour-context";

/**
 * The "?" trigger in the sidebar footer strip and its on-demand tour list.
 * On-demand only, by design (product-tour plan) — no tour is ever offered
 * proactively; this is the sole way a tour starts.
 */
export function TourLauncher({ roles }: { roles: string[] }) {
  const { toursForCurrentUser, statusOf, startTour, activeTourId } = useTour();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onDocClick(e: MouseEvent): void {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (toursForCurrentUser.length === 0) {
    // Nothing structurally applies to this role (e.g. no catalog entry lists
    // it yet) — an empty launcher is worse than no launcher at all.
    return null;
  }

  const completedCount = toursForCurrentUser.filter((t) => statusOf(t.id) === "completed").length;
  const primaryRole = roles[0] ? roles[0].charAt(0) + roles[0].slice(1).toLowerCase() : "";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Guided tours"
        title="Guided tours"
        data-testid="tour-launcher-trigger"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
          open
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-slate-300 text-slate-500 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700"
        }`}
      >
        ?
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Guided tours"
          data-testid="tour-launcher-panel"
          className="motion-rise absolute bottom-[calc(100%+8px)] left-0 z-50 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Guided tours</h3>
              {primaryRole ? (
                <span className="shrink-0 rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  {primaryRole}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Pick up where you left off, or start something new.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-[width] duration-[var(--motion-state)]"
                style={{ width: `${(completedCount / toursForCurrentUser.length) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 tabular">
              {completedCount} of {toursForCurrentUser.length} completed
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {toursForCurrentUser.map((tour) => {
              const status = statusOf(tour.id);
              const done = status === "completed";
              return (
                <div key={tour.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      done ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="m3 8.5 3 3 7-7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{tour.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{tour.description}</p>
                  </div>
                  <button
                    type="button"
                    disabled={activeTourId !== null}
                    onClick={() => {
                      setOpen(false);
                      startTour(tour.id);
                    }}
                    data-testid={`tour-start-${tour.id}`}
                    className={`shrink-0 self-center rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      done
                        ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        : "bg-teal-600 text-white hover:bg-teal-700"
                    }`}
                  >
                    {done ? "Review" : status === "skipped" ? "Resume" : "Start"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 4.6V8l2.6 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Tours you skip stay here — come back anytime.
          </div>
        </div>
      ) : null}
    </div>
  );
}
