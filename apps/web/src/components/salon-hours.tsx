import type { SalonHoursEntry } from "../lib/api-client";

/**
 * Opening hours, derived server-side as the union of active staff rotas —
 * there is no tenant-level "hours" column, so a null day genuinely means
 * nobody is rostered, not that the data is missing.
 *
 * Today's row is marked, because "are they open now" is the question this
 * table is usually opened to answer.
 */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function minutesToClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Mon=0..Sun=6, matching the API's dayOfWeek convention. */
function todayIndex(): number {
  const COLOMBO_OFFSET_MINUTES = 330;
  const colombo = new Date(Date.now() + COLOMBO_OFFSET_MINUTES * 60_000);
  return (colombo.getUTCDay() + 6) % 7;
}

export function SalonHours({ hours }: { hours: Array<SalonHoursEntry | null> }) {
  if (hours.every((h) => h === null)) {
    return null;
  }
  const today = todayIndex();

  return (
    <section className="mt-4">
      <h2 className="text-sm font-semibold text-slate-900">Opening hours</h2>
      <dl className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {DAY_NAMES.map((name, i) => {
          const entry = hours[i];
          const isToday = i === today;
          return (
            <div
              key={name}
              className={`flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 ${
                isToday ? "bg-teal-50" : ""
              }`}
            >
              <dt className={isToday ? "font-semibold text-teal-900" : "text-slate-700"}>
                {name}
                {isToday ? <span className="ml-1.5 text-xs font-normal">(today)</span> : null}
              </dt>
              <dd className={entry ? (isToday ? "text-teal-900" : "text-slate-700") : "text-slate-400"}>
                {entry ? `${minutesToClock(entry.startMin)} – ${minutesToClock(entry.endMin)}` : "Closed"}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
