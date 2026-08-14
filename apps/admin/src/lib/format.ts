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
