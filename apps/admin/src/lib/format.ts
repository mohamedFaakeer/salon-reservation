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

/**
 * The schedule API stores minutes from midnight (0–1439). That is a fine
 * storage format and a terrible thing to type, so the UI works in `HH:MM`
 * and converts at the edges — the same split the Services drawer uses for
 * rupees and cents.
 */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Returns null for anything that isn't a valid HH:MM inside a single day. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) {
    return null;
  }
  // 1439 is the last valid minute — the DTO has no 1440, so a shift that runs
  // to "midnight" ends at 23:59.
  return Math.min(h * 60 + m, 1439);
}

/** Mon-first, matching the API's dayOfWeek where 0 = Monday. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "18–22 Aug" / "2 Sep" — compact ranges for leave and closure rows. */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  if (startDate === endDate) {
    return start.toLocaleDateString("en-LK", opts);
  }
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  return sameMonth
    ? `${start.getUTCDate()}–${end.toLocaleDateString("en-LK", opts)}`
    : `${start.toLocaleDateString("en-LK", opts)} – ${end.toLocaleDateString("en-LK", opts)}`;
}

export interface StatusStyle {
  /** Badge/card background. */
  fill: string;
  /** Text on `fill` — every pair is >= 4.5:1 (WCAG AA). */
  fg: string;
  /** Saturated dot/accent, >= 3:1 on white (WCAG AA non-text). */
  accent: string;
  /** Human-readable label. Raw enum names are never shown to users. */
  label: string;
}

/**
 * UX.md §1 "Semantic status colors", re-derived for accessibility.
 *
 * UX.md's original hex values were accent-weight colors (amber-500, blue-500,
 * …) but were being used two ways that both failed:
 *   - as badge fills under white text — 8 of 9 fell below WCAG AA 4.5:1
 *     (PENDING_PAYMENT was 2.15:1, less than half the requirement);
 *   - as 10%-alpha calendar tints — all 9 composited to 1.08–1.14:1 against
 *     the white card, so every status looked identical on the day board.
 *
 * Each status now carries a fill/fg/accent triple instead of one hex. The
 * hues are unchanged (amber still means "waiting on money"); only the weights
 * are chosen per role. Verified: all 9 fg-on-fill pairs >= 5.4:1, all 9
 * accents >= 3.19:1 on white, and every pairwise fill/accent distance is
 * >= dE 11.9 so no two statuses read alike. NO_SHOW is deliberately the one
 * dark badge — it is the only status meaning "revenue lost, nobody came", and
 * the extra weight makes it scannable at a glance.
 *
 * Colour is never the sole channel: `label` always ships alongside (WCAG 1.4.1).
 */
const STATUS_STYLES: Record<string, StatusStyle> = {
  PENDING_PAYMENT: { fill: "#FEF3C7", fg: "#92400E", accent: "#D97706", label: "Pending payment" },
  CONFIRMED: { fill: "#DBEAFE", fg: "#1E40AF", accent: "#2563EB", label: "Confirmed" },
  CHECKED_IN: { fill: "#D1FAE5", fg: "#065F46", accent: "#059669", label: "Checked in" },
  IN_SERVICE: { fill: "#DDD6FE", fg: "#5B21B6", accent: "#7C3AED", label: "In service" },
  COMPLETED: { fill: "#D4D4D8", fg: "#3F3F46", accent: "#52525B", label: "Completed" },
  CANCELLED: { fill: "#FEE2E2", fg: "#991B1B", accent: "#DC2626", label: "Cancelled" },
  NO_SHOW: { fill: "#334155", fg: "#FFFFFF", accent: "#334155", label: "No-show" },
  EXPIRED: { fill: "#FED7AA", fg: "#9A3412", accent: "#EA580C", label: "Expired" },
  RESCHEDULED: { fill: "#CFFAFE", fg: "#155E75", accent: "#0891B2", label: "Rescheduled" },
};

const FALLBACK_STATUS: StatusStyle = {
  fill: "#D4D4D8",
  fg: "#3F3F46",
  accent: "#52525B",
  label: "Unknown",
};

export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status] ?? { ...FALLBACK_STATUS, label: humanizeStatus(status) };
}

export function statusLabel(status: string): string {
  return STATUS_STYLES[status]?.label ?? humanizeStatus(status);
}

/** Last-resort formatting for a status the API adds before the UI knows it. */
function humanizeStatus(status: string): string {
  const lower = status.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
