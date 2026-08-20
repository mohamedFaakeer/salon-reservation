import type { SalonHoursEntry } from "../lib/api-client";

/**
 * Opening hours, derived server-side from the union of active stylist rotas.
 * A null day genuinely means nobody is rostered — not that data is missing —
 * so it says Closed rather than a dash.
 *
 * Today's row is marked because "are they open now" is the question this table
 * is usually opened to answer.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Mon=0..Sun=6, matching the API's dayOfWeek convention. */
function todayIndex(): number {
  const colombo = new Date(Date.now() + 330 * 60_000);
  return (colombo.getUTCDay() + 6) % 7;
}

export function SalonHours({ hours }: { hours: Array<SalonHoursEntry | null> }) {
  if (hours.every((h) => h === null)) {
    return null;
  }
  const today = todayIndex();

  return (
    <section className="px-5 pt-6">
      <h2 className="display text-[22px] text-[var(--ink)]">Opening hours</h2>
      <dl className="mt-3 overflow-hidden rounded-[var(--radius-sm)] border border-[rgba(18,48,44,0.14)]">
        {DAYS.map((name, i) => {
          const entry = hours[i];
          const isToday = i === today;
          return (
            <div
              key={name}
              className={`flex items-center justify-between border-b border-[rgba(18,48,44,0.1)] px-3 py-2 text-[13px] last:border-b-0 ${
                isToday ? "bg-[var(--dye)] text-[#022B27]" : "text-[var(--ink)]"
              }`}
            >
              <dt className={isToday ? "font-bold" : "font-medium"}>
                {name}
                {isToday ? <span className="ml-1.5 text-[11px] font-medium">today</span> : null}
              </dt>
              <dd className={`tabular ${entry ? "" : "opacity-55"}`}>
                {entry ? `${clock(entry.startMin)} – ${clock(entry.endMin)}` : "Closed"}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
