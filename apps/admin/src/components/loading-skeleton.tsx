/**
 * Skeletons that match the shape of what they replace.
 *
 * A single generic bar stack previously stood in for six different layouts, so
 * every load ended in a visible jump as real content pushed the page around.
 * Each variant below mirrors the component it covers, which keeps the layout
 * still and makes the wait legible rather than merely occupied.
 *
 * All variants carry role="status" so the wait is announced once, not per bar.
 */

function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton rounded-md ${className}`} style={style} />;
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

/** Mirrors DashboardStats' responsive card grid. */
export function StatsSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
      role="status"
      aria-label="Loading today's numbers"
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
          <Bar className="h-3 w-16" />
          <Bar className="mt-2 h-5 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors DayCalendar: time axis, staff columns with a dot + name, and cards. */
export function CalendarSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-slate-200 bg-white"
      role="status"
      aria-label="Loading the day calendar"
    >
      <div className="w-14 shrink-0 border-r border-slate-200">
        <div className="h-10 border-b border-slate-200" />
        <div className="flex flex-col gap-14 px-2 pt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bar key={i} className="h-3" />
          ))}
        </div>
      </div>
      {Array.from({ length: columns }).map((_, col) => (
        <div key={col} className="min-w-[180px] flex-1 border-r border-slate-200 last:border-r-0">
          <div className="flex h-10 items-center gap-2 border-b border-slate-200 px-2">
            <Bar className="h-2 w-2 rounded-full" />
            <Bar className="h-3 w-20" />
          </div>
          <div className="flex flex-col gap-2 p-2">
            {/* Varied heights so the placeholder reads as a real day, not a grid. */}
            <Bar className={col % 2 === 0 ? "h-16" : "h-10"} />
            <Bar className={col % 2 === 0 ? "h-10" : "h-20"} />
            {col % 3 === 0 ? <Bar className="h-12" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the notifications table's column rhythm. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      role="status"
      aria-label="Loading notifications"
    >
      <div className="flex gap-4 border-b border-slate-200 px-4 py-2">
        {[16, 24, 16, 28, 14].map((w, i) => (
          <Bar key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3">
          {[16, 24, 16, 28, 14].map((w, i) => (
            <Bar key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Mirrors the appointment list rows on the narrow (non-calendar) layout. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading appointments">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded border border-slate-200 bg-white p-3"
        >
          <Bar className="h-4 w-40" />
          <Bar className="h-5 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Mirrors Settings' stack of titled cards. The field counts match the real
 * sections (4 / 4 / 3 / 3 / 1) so the page doesn't reflow when they arrive.
 */
export function SettingsSkeleton() {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-4"
      role="status"
      aria-label="Loading settings"
    >
      {[4, 4, 3, 3, 1].map((fields, s) => (
        <div key={s} className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <Bar className="h-3.5 w-32" />
            <Bar className="mt-2 h-2.5 w-64 max-w-full" />
          </div>
          <div className="flex flex-col gap-4 px-4 py-4">
            {Array.from({ length: fields }).map((_, f) => (
              <div key={f} className="flex flex-col gap-1.5">
                <Bar className="h-2.5 w-24" />
                <Bar className="h-11" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the drawer's time-slot grid. */
export function SlotsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="status" aria-label="Loading available times">
      {Array.from({ length: count }).map((_, i) => (
        <Bar key={i} className="h-12" />
      ))}
    </div>
  );
}
