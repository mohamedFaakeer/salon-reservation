export function formatPriceCents(cents: number): string {
  return `Rs. ${(cents / 100).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;
}

export function formatDurationMin(min: number): string {
  if (min < 60) {
    return `${min} min`;
  }
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" });
}

/**
 * Colombo-local "today" (fixed +05:30, no DST — mirrors apps/api's
 * time.util.ts `colomboNow`). `new Date().toISOString().slice(0,10)` would
 * give the UTC calendar date, a different day from Colombo's for ~5.5 hours
 * of every day (UTC 18:30–23:59) — a real bug for anything sent to the API,
 * which operates in tenant-local (Colombo) terms.
 */
export function todayLocalDate(): string {
  const COLOMBO_OFFSET_MINUTES = 330;
  return new Date(Date.now() + COLOMBO_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** UX.md §1 "Semantic status colors" — exact hex values, single source of truth for calendar cards + status badges. */
const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "#F59E0B",
  CONFIRMED: "#3B82F6",
  CHECKED_IN: "#10B981",
  IN_SERVICE: "#8B5CF6",
  COMPLETED: "#64748B",
  CANCELLED: "#EF4444",
  NO_SHOW: "#9CA3AF",
  EXPIRED: "#F97316",
  RESCHEDULED: "#0EA5E9",
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#64748B";
}
