import type { SalonProfile } from "../lib/api-client";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { colomboToday } from "../lib/format";

const DISPLAY_WINDOW_DAYS = 30;
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isClosed(dateStr: string, closures: SalonProfile["closures"]): boolean {
  return closures.some((c) => c.startDate <= dateStr && dateStr <= c.endDate);
}

/**
 * Pick a day.
 *
 * A horizontal strip rather than a month grid: on a phone the next fortnight is
 * what anyone actually books, and a strip you thumb through beats a calendar
 * you pinch.
 *
 * Disabling here is best-effort from data already on the public profile —
 * closures and the derived weekday hours. The tenant's booking window and
 * same-day lead are not exposed publicly, so the availability step's empty
 * state remains the server-authoritative answer. A client-side business rule is
 * never the truth.
 */
export function DatePicker({ salon, wizard }: { salon: SalonProfile; wizard: BookingWizard }) {
  const days: string[] = [];
  const cursor = new Date(`${colomboToday()}T00:00:00Z`);
  for (let i = 0; i < DISPLAY_WINDOW_DAYS; i += 1) {
    days.push(toDateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const today = colomboToday();

  return (
    <div>
      <h2 className="display text-[28px] text-[var(--ink)]">
        Which
        <span className="block">day?</span>
      </h2>

      <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-1">
        <ul className="flex gap-2">
          {days.map((day) => {
            const d = new Date(`${day}T00:00:00Z`);
            const dayOfWeek = (d.getUTCDay() + 6) % 7;
            const disabled = isClosed(day, salon.closures) || salon.hours[dayOfWeek] === null;
            const selected = wizard.selectedDate === day;
            return (
              <li key={day} className="shrink-0">
                <button
                  type="button"
                  data-testid={`date-option-${day}`}
                  disabled={disabled}
                  onClick={() => wizard.setSelectedDate(day)}
                  aria-pressed={selected}
                  aria-label={`${WEEKDAY[dayOfWeek]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}${
                    disabled ? " — closed" : ""
                  }`}
                  className={`flex min-h-12 w-[62px] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-sm)] border-[1.5px] py-2.5 transition-colors duration-[var(--t-tap)] ${
                    disabled
                      ? "cursor-not-allowed border-[rgba(18,48,44,0.08)] text-[rgba(18,48,44,0.3)]"
                      : selected
                        ? "border-[var(--indigo-lift)] bg-[var(--indigo)] text-[var(--resist)]"
                        : "border-[rgba(18,48,44,0.14)] text-[var(--ink)] hover:border-[rgba(18,48,44,0.32)]"
                  }`}
                >
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] opacity-70">
                    {day === today ? "Today" : WEEKDAY[dayOfWeek]}
                  </span>
                  <span className="display tabular text-[18px]">{d.getUTCDate()}</span>
                  <span className="text-[9px] uppercase tracking-[0.08em] opacity-60">
                    {MONTH[d.getUTCMonth()]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
