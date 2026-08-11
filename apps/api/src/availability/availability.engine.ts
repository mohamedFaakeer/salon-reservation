import { colomboNow, daysBetween, localMinutesToUtc } from "./time.util";

/** No fixed 30/60 grid (DATABASE.md §5) — candidates step through free windows at this granularity. */
const SLOT_STEP_MIN = 15;

export interface WorkingWindow {
  startMin: number;
  endMin: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
}

export interface BusyInterval {
  startMin: number;
  endMin: number;
}

export interface StaffContext {
  staffId: string;
  staffName: string;
  /** null = day off (no WorkingSchedule row for this weekday). */
  schedule: WorkingWindow | null;
  onLeave: boolean;
  busyIntervals: BusyInterval[];
}

export interface SlotCandidate {
  staffId: string;
  staffName: string;
  start: Date;
  end: Date;
}

export interface FindSlotsInput {
  /** Tenant-local YYYY-MM-DD calendar date. */
  date: string;
  durationMin: number;
  /** Already filtered to staff qualified for every requested service. */
  staff: StaffContext[];
  salonClosed: boolean;
  now: Date;
  sameDayLeadMinutes: number;
  bookingWindowDays: number;
}

interface Interval {
  start: number;
  end: number;
}

export function findSlots(input: FindSlotsInput): SlotCandidate[] {
  const { date, durationMin, staff, salonClosed, now, sameDayLeadMinutes, bookingWindowDays } = input;

  if (salonClosed) {
    return [];
  }

  const today = colomboNow(now);
  const offsetDays = daysBetween(today.date, date);
  if (offsetDays < 0 || offsetDays > bookingWindowDays) {
    return [];
  }
  const leadTimeFloorMin = offsetDays === 0 ? today.minutes + sameDayLeadMinutes : -Infinity;

  const results: SlotCandidate[] = [];
  for (const ctx of staff) {
    if (!ctx.schedule || ctx.onLeave) {
      continue;
    }

    for (const window of freeWindows(ctx.schedule, ctx.busyIntervals)) {
      const floor = Math.max(window.start, leadTimeFloorMin);
      if (floor + durationMin > window.end) {
        continue;
      }

      const starts = new Set<number>();
      for (let t = floor; t + durationMin <= window.end; t += SLOT_STEP_MIN) {
        starts.add(t);
      }
      // Always offer the last possible back-to-back start, even if the window
      // length isn't a multiple of the step (so a slot ending exactly at a
      // break/conflict boundary is never missed — matrix §2.1 #8).
      const lastStart = window.end - durationMin;
      if (lastStart >= floor) {
        starts.add(lastStart);
      }

      for (const start of Array.from(starts).sort((a, b) => a - b)) {
        results.push({
          staffId: ctx.staffId,
          staffName: ctx.staffName,
          start: localMinutesToUtc(date, start),
          end: localMinutesToUtc(date, start + durationMin),
        });
      }
    }
  }

  results.sort((a, b) => a.start.getTime() - b.start.getTime());
  return results;
}

export interface CanBookInput {
  start: Date;
  end: Date;
  /** Whether the staff has a StaffServiceAssignment row for every requested service. */
  qualified: boolean;
  staff: StaffContext;
  salonClosed: boolean;
  now: Date;
  sameDayLeadMinutes: number;
  bookingWindowDays: number;
}

export type CanBookResult = { ok: true } | { ok: false; code: string; message: string };

/**
 * Re-validates one specific proposed slot from first principles — never
 * trusts a candidate returned by an earlier `findSlots` call. Reused
 * unchanged by P10's transactional `reserve` (ARCHITECTURE.md §4.2 step 1).
 */
export function canBook(input: CanBookInput): CanBookResult {
  const { start, end, qualified, staff, salonClosed, now, sameDayLeadMinutes, bookingWindowDays } = input;

  if (!qualified) {
    return fail("STAFF_NOT_QUALIFIED", "This staff member cannot perform the requested services.");
  }

  const local = colomboNow(start);
  const durationMin = (end.getTime() - start.getTime()) / 60_000;
  const startMin = local.minutes;
  const endMin = startMin + durationMin;

  const today = colomboNow(now);
  const offsetDays = daysBetween(today.date, local.date);
  if (offsetDays < 0 || offsetDays > bookingWindowDays) {
    return fail("OUTSIDE_BOOKING_WINDOW", "This date is outside the salon's booking window.");
  }

  if (salonClosed) {
    return fail("STAFF_UNAVAILABLE", "The salon is closed on this date.");
  }
  if (!staff.schedule) {
    return fail("STAFF_UNAVAILABLE", "This staff member does not work on this day.");
  }
  if (staff.onLeave) {
    return fail("STAFF_UNAVAILABLE", "This staff member is on leave.");
  }

  if (startMin < staff.schedule.startMin || endMin > staff.schedule.endMin) {
    return fail("OUTSIDE_WORKING_HOURS", "This time is outside working hours.");
  }

  if (
    staff.schedule.breakStartMin != null &&
    staff.schedule.breakEndMin != null &&
    overlaps(startMin, endMin, staff.schedule.breakStartMin, staff.schedule.breakEndMin)
  ) {
    return fail("INSIDE_BREAK", "This time falls within a break.");
  }

  if (offsetDays === 0 && startMin < today.minutes + sameDayLeadMinutes) {
    return fail("LEAD_TIME_VIOLATION", "This time is too soon to book.");
  }

  if (staff.busyIntervals.some((b) => overlaps(startMin, endMin, b.startMin, b.endMin))) {
    return fail("SLOT_UNAVAILABLE", "That slot was just booked by another customer.");
  }

  return { ok: true };
}

function fail(code: string, message: string): CanBookResult {
  return { ok: false, code, message };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Subtracts the break window and all busy intervals from the working window. */
function freeWindows(schedule: WorkingWindow, busy: BusyInterval[]): Interval[] {
  const blocked: Interval[] = busy.map((b) => ({ start: b.startMin, end: b.endMin }));
  if (schedule.breakStartMin != null && schedule.breakEndMin != null) {
    blocked.push({ start: schedule.breakStartMin, end: schedule.breakEndMin });
  }

  const clipped = blocked
    .map((b) => ({ start: Math.max(b.start, schedule.startMin), end: Math.min(b.end, schedule.endMin) }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      merged.push({ ...b });
    }
  }

  const free: Interval[] = [];
  let cursor = schedule.startMin;
  for (const b of merged) {
    if (b.start > cursor) {
      free.push({ start: cursor, end: b.start });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < schedule.endMin) {
    free.push({ start: cursor, end: schedule.endMin });
  }
  return free;
}
