import type { SalonProfile } from "../lib/api-client";
import type { BookingWizard } from "../hooks/use-booking-wizard";
import { formatDateLong } from "../lib/format";

const DISPLAY_WINDOW_DAYS = 30;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isClosed(dateStr: string, closures: SalonProfile["closures"]): boolean {
  return closures.some((c) => c.startDate <= dateStr && dateStr <= c.endDate);
}

/**
 * Best-effort disabling using only data already on the public profile
 * (closures + the derived per-weekday hours). The tenant's actual booking
 * window/same-day lead time aren't exposed here — the availability step's
 * empty state is the real, server-authoritative fallback for any date that
 * turns out to be unbookable (never trust a client-side business rule).
 */
export function DatePicker({ salon, wizard }: { salon: SalonProfile; wizard: BookingWizard }) {
  const days: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < DISPLAY_WINDOW_DAYS; i++) {
    days.push(toDateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-slate-900">Choose a date</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {days.map((day) => {
          const dayOfWeek = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
          const disabled = isClosed(day, salon.closures) || salon.hours[dayOfWeek] === null;
          const selected = wizard.selectedDate === day;
          return (
            <button
              key={day}
              type="button"
              data-testid={`date-option-${day}`}
              disabled={disabled}
              onClick={() => wizard.setSelectedDate(day)}
              aria-pressed={selected}
              className={`min-h-11 rounded-lg border p-2 text-sm transition ${
                disabled
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                  : selected
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
              }`}
            >
              {formatDateLong(day)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
