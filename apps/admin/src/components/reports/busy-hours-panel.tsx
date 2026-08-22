import type { BusyHourCell } from "../../lib/api-client";
import { Card, LockedPanel, Panel, Quiet } from "./report-shell";

/**
 * When the salon is actually busy, as weekday against hour.
 *
 * A heatmap rather than a bar chart because the question has two dimensions:
 * "Saturday afternoon" is the answer, and a chart of hours alone loses the
 * day. Days are Mon=0..Sun=6, matching the rota's own numbering rather than
 * introducing a second convention.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Teal ramp. Magnitude only — it never encodes state. */
const RAMP = ["#f1f5f9", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#0d9488"];

export function BusyHoursPanel({ cells }: { cells: BusyHourCell[] | null }) {
  if (!cells) {
    return (
      <LockedPanel
        title="When the salon is busy"
        teaser="Ask about upgrading to see a heatmap of your busiest days and hours."
      />
    );
  }
  if (cells.length === 0) {
    return (
      <Panel title="When the salon is busy">
        <Card>
          <Quiet>No appointments fell in this period, so there is no pattern to show yet.</Quiet>
        </Card>
      </Panel>
    );
  }

  // The grid spans only the hours that actually saw work. A fixed 00–23 would
  // be three-quarters empty and make the busy block unreadably narrow.
  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const firstHour = hours[0];
  const lastHour = hours[hours.length - 1];
  const span = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  const busiest = Math.max(...cells.map((c) => c.count));
  const lookup = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.hour}`, c.count]));
  const peak = cells.reduce((best, c) => (c.count > best.count ? c : best), cells[0]);

  return (
    <Panel title="When the salon is busy" note="appointments by hour, across the chosen period">
      <Card className="p-4">
        <div
          className="grid gap-[3px] overflow-x-auto"
          style={{ gridTemplateColumns: `44px repeat(${span.length}, minmax(24px, 1fr))` }}
        >
          <span />
          {span.map((hour) => (
            <span key={`h-${hour}`} className="text-center text-[10px] text-slate-500 tabular">
              {hour}
            </span>
          ))}

          {DAYS.map((day, dayIndex) => (
            <Row
              key={day}
              day={day}
              dayIndex={dayIndex}
              span={span}
              lookup={lookup}
              busiest={busiest}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span>Quiet</span>
          {RAMP.map((shade) => (
            <span
              key={shade}
              aria-hidden="true"
              className="h-2 w-4 rounded-sm"
              style={{ background: shade }}
            />
          ))}
          <span>Busy</span>
          <span className="ml-3">
            Busiest: {DAYS[peak.dayOfWeek]} at {formatHour(peak.hour)} — {peak.count} appointment
            {peak.count === 1 ? "" : "s"}.
          </span>
        </div>
      </Card>
    </Panel>
  );
}

function Row({
  day,
  dayIndex,
  span,
  lookup,
  busiest,
}: {
  day: string;
  dayIndex: number;
  span: number[];
  lookup: Map<string, number>;
  busiest: number;
}) {
  return (
    <>
      <span className="flex h-6.5 items-center text-[11px] text-slate-500">{day}</span>
      {span.map((hour) => {
        const count = lookup.get(`${dayIndex}-${hour}`) ?? 0;
        const shade = RAMP[intensity(count, busiest)];
        return (
          <span
            key={`${dayIndex}-${hour}`}
            data-testid={`heat-${dayIndex}-${hour}`}
            title={`${day} ${formatHour(hour)} — ${count} appointment${count === 1 ? "" : "s"}`}
            className="flex h-6.5 items-center justify-center rounded-[3px] text-[11px] tabular"
            style={{
              background: shade,
              // The darkest two shades need light text to stay legible.
              color: count > busiest * 0.66 ? "#ffffff" : "#134e4a",
            }}
          >
            {count > 0 ? count : ""}
          </span>
        );
      })}
    </>
  );
}

/** Five live steps above the empty one, so a single booking still registers. */
function intensity(count: number, busiest: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.min(RAMP.length - 1, Math.max(1, Math.ceil((count / busiest) * (RAMP.length - 1))));
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}
