import type { AppointmentRecord, StaffMember } from "../lib/api-client";
import { formatPriceCents, formatTime, statusColor } from "../lib/format";
import { EmptyState } from "./empty-state";

/** Fixed 08:00–20:00 window — a reasonable MVP default (typical salon hours), not derived per-day from staff schedules (P16 plan decision 3). */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 20 * 60;
const PX_PER_MIN = 1;
const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 }, (_, i) => DAY_START_MIN / 60 + i);
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
  if (staff.length === 0) {
    return <EmptyState title="No staff to show on the calendar yet." />;
  }

  const byStaff = new Map<string, AppointmentRecord[]>();
  for (const appt of appointments) {
    const list = byStaff.get(appt.staffId) ?? [];
    list.push(appt);
    byStaff.set(appt.staffId, list);
  }

  const gridHeight = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

  return (
    <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="w-14 shrink-0 border-r border-slate-200">
        <div className="h-10 border-b border-slate-200" />
        <div style={{ height: gridHeight }} className="relative">
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 -translate-y-1/2 px-1 text-right text-xs text-slate-400"
              style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}
            >
              {h.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>
      </div>

      {staff.map((s) => (
        <div
          key={s.id}
          data-testid={`calendar-staff-column-${s.id}`}
          className="min-w-[180px] flex-1 border-r border-slate-200 last:border-r-0"
        >
          <div
            data-testid={`calendar-staff-header-${s.id}`}
            className="flex h-10 items-center gap-2 border-b border-slate-200 px-2 text-sm font-medium text-slate-700"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? FALLBACK_STAFF_COLOR }} />
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
              const startMin = Math.min(Math.max(minutesOfDay(appt.startTime), DAY_START_MIN), DAY_END_MIN);
              const endMin = Math.min(Math.max(minutesOfDay(appt.endTime), DAY_START_MIN), DAY_END_MIN);
              const top = (startMin - DAY_START_MIN) * PX_PER_MIN;
              const height = Math.max((endMin - startMin) * PX_PER_MIN, 20);
              return (
                <button
                  key={appt.id}
                  type="button"
                  data-testid={`calendar-card-${appt.id}`}
                  onClick={() => onSelect(appt.id)}
                  className="absolute left-1 right-1 overflow-hidden rounded border-l-4 bg-white p-1 text-left text-xs shadow-sm hover:shadow-md"
                  style={{
                    top,
                    height,
                    borderLeftColor: s.color ?? FALLBACK_STAFF_COLOR,
                    backgroundColor: `${statusColor(appt.status)}1A`,
                  }}
                >
                  <p className="truncate font-medium text-slate-900">
                    {formatTime(appt.startTime)}{" "}
                    {appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}` : appt.bookingReference}
                  </p>
                  <p className="truncate text-slate-500">
                    {appt.status}
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
