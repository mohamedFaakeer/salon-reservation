/**
 * Skeletons that match the shape of what they replace, so the layout stays
 * still when real content arrives instead of jumping. All variants carry
 * role="status" so the wait is announced once rather than per bar.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** Generic stacked rows — the fallback when a surface has no distinct shape. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} className="h-12" />
      ))}
    </div>
  );
}

/** Mirrors SlotGrid's 2-up (3-up on sm) tile grid, including the tile's two text lines. */
export function SlotsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
      role="status"
      aria-label="Loading available times"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 p-2"
        >
          <Bar className="h-4 w-14" />
          <Bar className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the service list rows on the salon page. */
export function ServiceListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading services">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="flex flex-col gap-1">
            <Bar className="h-4 w-36" />
            <Bar className="h-3 w-20" />
          </div>
          <Bar className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the booking-detail card on the reference lookup page. */
export function BookingDetailSkeleton() {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4"
      role="status"
      aria-label="Loading your booking"
    >
      <Bar className="h-3 w-14" />
      <Bar className="mt-2 h-5 w-28" />
      <Bar className="mt-4 h-3 w-14" />
      <Bar className="mt-2 h-4 w-48" />
      <Bar className="mt-4 h-3 w-16" />
      <Bar className="mt-2 h-4 w-56" />
      <Bar className="mt-4 h-5 w-24" />
    </div>
  );
}
