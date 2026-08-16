import type { AppointmentRecord, StaffMember } from "../lib/api-client";
import { formatPriceCents, formatTime, statusStyle } from "../lib/format";
import { EmptyState } from "./empty-state";

/** Fixed 08:00–20:00 window — a reasonable MVP default (typical salon hours), not derived per-day from staff schedules (P16 plan decision 3). */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;
const PX_PER_MIN = 1;
const HOURS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 },
  (_, i) => DAY_START_MIN / 60 + i,
);
const FALLBACK_STAFF_COLOR = "#0D9488";

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function DayCalendar({
  appointments,
  staff,
  onSelect,
}: {
  appointments: AppointmentRecord[];
  staff: StaffMember[];
  onSelect: (id: string) => void;
}) {
  const byStaff = new Map<string, AppointmentRecord[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staffId) ?? [];
    list.push(appt);
    byStaff.set(appt.staffId, list);
  }

  // Only staff with something on today's board get a column — a tenant can
  // accumulate far more staff rows over time than are actually working (or
  // ever worked) any given day, and rendering one column per staff row
  // regardless makes the grid unusably wide.
  const workingStaff = staff.filter((s) => byStaff.has(s.id));

  if (workingStaff.length === 0) {
    return <EmptyState title="No staff scheduled on today's board yet." />;
  }

  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

  return (
    <div className="motion-fade flex overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="w-14 shrink-0 border-r border-slate-200">
        <div className="h-10 border-b border-slate-200" />
        <div style={{ height: gridHeight }} className="relative">
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 -translate-y-1/2 px-1 text-right text-xs text-slate-500"
              style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}
            >
              {h.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>
      </div>

      {workingStaff.map((s) => (
        <div
          key={s.id}
          data-testid={`calendar-staff-column-${s.id}`}
          className="min-w-[180px] flex-1 border-r border-slate-200 last:border-r-0"
        >
          <div
            data-testid={`calendar-staff-header-${s.id}`}
            className="flex h-10 items-center gap-2 border-b border-slate-200 px-2 text-sm font-medium text-slate-700"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color ?? FALLBACK_STAFF_COLOR }}
            />
            {s.name}
          </div>
          <div className="relative" style={{ height: gridHeight }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-b border-slate-100"
                style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}
              />
            ))}
            {(byStaff.get(s.id) ?? []).map((appt) => {
              const startMin = Math.min(
                Math.max(minutesOfDay(appt.startTime), DAY_START_MIN),
                DAY_END_MIN,
              );
              const endMin = Math.min(
                Math.max(minutesOfDay(appt.endTime), DAY_START_MIN),
                DAY_END_MIN,
              );
              const top = (startMin - DAY_START_MIN) * PX_PER_MIN;
              const height = Math.max((endMin - startMin) * PX_PER_MIN, 20);
              const status = statusStyle(appt.status);
              return (
                <button
                  key={appt.id}
                  type="button"
                  data-testid={`calendar-card-${appt.id}`}
                  onClick={() => onSelect(appt.id)}
                  className="absolute left-1 right-1 overflow-hidden rounded p-1 text-left text-xs shadow-sm hover:shadow-md"
                  // The column this card sits in already names the staff member,
                  // so the card itself is free to encode status instead. Status
                  // rides on three channels — fill, accent dot, and the written
                  // label — so it survives both low-contrast displays and
                  // colour-blindness (WCAG 1.4.1).
                  style={{ top, height, backgroundColor: status.fill, color: status.fg }}
                >
                  <p className="truncate font-medium">
                    {formatTime(appt.startTime)}{" "}
                    {appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`
                      : appt.bookingReference}
                  </p>
                  <p className="flex items-center gap-1 truncate">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: status.accent }}
                    />
                    {status.label}
                    {appt.balanceCents > 0 ? ` · ${formatPriceCents(appt.balanceCents)} due` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
