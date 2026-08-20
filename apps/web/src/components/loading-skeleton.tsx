/**
 * Skeletons that match the shape of what they replace, so the layout stays
 * still when real content arrives instead of jumping. All variants carry
 * role="status" so the wait is announced once rather than per bar.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-[rgba(18,48,44,0.09)] ${className}`} />;
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
    <div role="status" aria-label="Finding open times">
      {/* Holds the lit panel's exact box, so nothing jumps when it lands. */}
      <div className="h-[92px] rounded-[var(--radius)] bg-[rgba(18,48,44,0.07)]" />
      <div className="mt-6 grid grid-cols-3 gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="h-[62px] rounded-[var(--radius-sm)] bg-[rgba(18,48,44,0.07)]"
          />
        ))}
      </div>
    </div>
  );
}

export function ServiceListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading services">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[rgba(18,48,44,0.12)] p-3"
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
      className="rounded-[var(--radius)] border border-[rgba(18,48,44,0.12)] p-4"
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
