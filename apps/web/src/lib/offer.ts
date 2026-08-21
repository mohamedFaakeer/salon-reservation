import type { OfferWindow } from "./api-client";

/**
 * Saying when an offer runs, in the customer's own terms.
 *
 * This exists because the salon page has no time chosen yet, so an offer is a
 * condition rather than a price. A page that showed only a lower figure —
 * one that becomes the full price once a Saturday slot is picked — would read
 * as a bait, and would deserve to.
 *
 * Formatting only. What the offer is worth, and whether it applies to a given
 * slot, are the server's to decide (CLAUDE.md §2).
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * When the offer runs, as a phrase to sit after its name.
 *
 * An offer with hours is described by its hours; one without is described by
 * when it ends, because "any time" alone tells a customer nothing they cannot
 * already see. Either way the sentence answers "does this apply to me?".
 */
export function describeOffer(offer: { endDate: string; windows: OfferWindow[] }): string {
  return offer.windows.length === 0
    ? `until ${shortDate(offer.endDate)}`
    : describeOfferWindows(offer.windows);
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-LK", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function describeOfferWindows(windows: OfferWindow[]): string {
  if (windows.length === 0) {
    return "any time";
  }

  // Days sharing the same hours are named together — "Mon, Tue 5–8pm" is how
  // somebody would say it out loud, not one clause per day.
  const byHours = new Map<string, number[]>();
  for (const w of [...windows].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin)) {
    const key = `${w.startMin}-${w.endMin}`;
    byHours.set(key, [...(byHours.get(key) ?? []), w.dayOfWeek]);
  }

  const clauses = [...byHours.entries()].map(([key, days]) => {
    const [startMin, endMin] = key.split("-").map(Number);
    return `${days.map((d) => DAYS[d]).join(", ")} ${shortTime(startMin)}–${shortTime(endMin)}`;
  });

  return clauses.length <= 1 ? clauses[0] : `${clauses.slice(0, -1).join(" · ")} · ${clauses[clauses.length - 1]}`;
}

function shortTime(min: number): string {
  const hour = Math.floor(min / 60) % 24;
  const minute = min % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}
