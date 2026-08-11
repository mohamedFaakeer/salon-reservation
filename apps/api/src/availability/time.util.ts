/**
 * Fixed-offset Asia/Colombo (UTC+05:30, no DST) date/time math.
 * MVP is Sri-Lanka-only (CLAUDE.md), so a real IANA timezone library is
 * unnecessary — the offset never changes. Revisit if multi-country ever
 * enters scope (currently explicitly out of MVP scope).
 */

const COLOMBO_OFFSET_MINUTES = 330;

/** `date` is a tenant-local `YYYY-MM-DD` calendar string (not a timestamp). */
export function dayOfWeekOf(date: string): number {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay(); // Sun=0..Sat=6
  return (jsDay + 6) % 7; // Mon=0..Sun=6, matches WorkingSchedule.dayOfWeek
}

/** Combines a local calendar date + minutes-since-local-midnight into the real UTC instant. */
export function localMinutesToUtc(date: string, minutes: number): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  return new Date(utcMidnight - COLOMBO_OFFSET_MINUTES * 60_000 + minutes * 60_000);
}

/** What the Colombo-local calendar date and minute-of-day are for a given UTC instant. */
export function colomboNow(now: Date): { date: string; minutes: number } {
  const shifted = new Date(now.getTime() + COLOMBO_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Calendar-day difference `b - a`; both are already local `YYYY-MM-DD` dates. */
export function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / msPerDay);
}
