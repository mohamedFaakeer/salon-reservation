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
 * Human-readable appointment status. Customers should never be shown the raw
 * enum ("PENDING_PAYMENT"); the labels match apps/admin's `statusLabel` so
 * staff and customer wording stays identical when they talk on the phone.
 */
const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  EXPIRED: "Expired",
  RESCHEDULED: "Rescheduled",
};

export function statusLabel(status: string): string {
  const known = STATUS_LABELS[status];
  if (known) {
    return known;
  }
  const lower = status.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A full instant (e.g. a receipt's `createdAt`), not just a calendar date — `formatDateLong` takes a bare date string, this takes an ISO timestamp. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-LK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  });
}

export function formatDateLong(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-LK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Colombo-local "today" (fixed +05:30, no DST — mirrors apps/api's
 * time.util.ts `colomboNow`). `new Date().toISOString().slice(0,10)` would
 * give the UTC calendar date, which is a different day from Colombo's for
 * ~5.5 hours of every day (UTC 18:30–23:59) — a real bug if used for
 * anything sent to the API, which operates in tenant-local (Colombo) terms.
 */
export function colomboToday(): string {
  const COLOMBO_OFFSET_MINUTES = 330;
  return new Date(Date.now() + COLOMBO_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/**
 * A plain Google Maps directions link — no API key needed, unlike an
 * embedded map or a Places lookup. Callers hide the button entirely when
 * either coordinate is null; this never returns a placeholder URL.
 */
export function getDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
