import { colomboNow, localMinutesToUtc } from "./time.util";
import {
  canBook,
  findSlots,
  type FindSlotsInput,
  type StaffContext,
  type WorkingWindow,
} from "./availability.engine";

// Fixed clock: 2024-01-01T04:00:00Z = Colombo Mon 2024-01-01 09:30 (minute 570).
const NOW = new Date("2024-01-01T04:00:00.000Z");
const SAME_DAY_LEAD_MIN = 120;
const BOOKING_WINDOW_DAYS = 30;
const TODAY = "2024-01-01";
const FUTURE_DATE = "2024-01-02"; // offsetDays = 1, no lead-time floor applies

const baseSchedule: WorkingWindow = {
  startMin: 540, // 09:00
  endMin: 1020, // 17:00
  breakStartMin: 720, // 12:00
  breakEndMin: 780, // 13:00
};

function staffCtx(overrides: Partial<StaffContext> = {}): StaffContext {
  return {
    staffId: "staff-1",
    staffName: "Staff One",
    schedule: baseSchedule,
    onLeave: false,
    busyIntervals: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<FindSlotsInput> = {}): FindSlotsInput {
  return {
    date: FUTURE_DATE,
    durationMin: 45,
    staff: [staffCtx()],
    salonClosed: false,
    now: NOW,
    sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
    bookingWindowDays: BOOKING_WINDOW_DAYS,
    ...overrides,
  };
}

describe("availability engine — §2.1 test matrix", () => {
  it("#1 normal booking within working hours -> slot offered", () => {
    const slots = findSlots(baseInput());
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].staffId).toBe("staff-1");
    expect(colomboNow(slots[0].start).minutes).toBe(540);
  });

  it("#2 staff unavailable that weekday (no schedule) -> no slots", () => {
    const slots = findSlots(baseInput({ staff: [staffCtx({ schedule: null })] }));
    expect(slots).toEqual([]);
  });

  it("#3 staff on break -> break window not offered", () => {
    const slots = findSlots(baseInput());
    const overlapsBreak = slots.some((s) => {
      const startMin = colomboNow(s.start).minutes;
      const endMin = startMin + 45;
      return startMin < 780 && 720 < endMin;
    });
    expect(overlapsBreak).toBe(false);
  });

  it("#4 staff on leave -> no slots across leave dates", () => {
    const slots = findSlots(baseInput({ staff: [staffCtx({ onLeave: true })] }));
    expect(slots).toEqual([]);
  });

  it("#5 existing appointment blocks the same window", () => {
    const slots = findSlots(
      baseInput({ staff: [staffCtx({ busyIntervals: [{ startMin: 600, endMin: 660 }] })] }),
    );
    const overlapsBusy = slots.some((s) => {
      const startMin = colomboNow(s.start).minutes;
      const endMin = startMin + 45;
      return startMin < 660 && 600 < endMin;
    });
    expect(overlapsBusy).toBe(false);
  });

  it("#6 multiple services -> summed duration respected", () => {
    const slots = findSlots(baseInput({ durationMin: 65 }));
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect((s.end.getTime() - s.start.getTime()) / 60_000).toBe(65);
    }
  });

  it("#7 Any Available Staff -> aggregates across staff, earliest first", () => {
    const staffA = staffCtx({
      staffId: "staff-a",
      staffName: "Staff A",
      schedule: { startMin: 600, endMin: 700 },
    });
    const staffB = staffCtx({
      staffId: "staff-b",
      staffName: "Staff B",
      schedule: { startMin: 540, endMin: 640 },
    });
    const slots = findSlots(baseInput({ staff: [staffA, staffB] }));
    expect(slots.some((s) => s.staffId === "staff-a")).toBe(true);
    expect(slots.some((s) => s.staffId === "staff-b")).toBe(true);
    expect(slots[0].staffId).toBe("staff-b");
    expect(colomboNow(slots[0].start).minutes).toBe(540);
  });

  it("#8 boundary: slot ending exactly at break start is offered; crossing the break is rejected", () => {
    const slots = findSlots(baseInput({ durationMin: 180 })); // 540-720 fills exactly up to the break
    const hasExactBoundarySlot = slots.some(
      (s) => colomboNow(s.start).minutes === 540 && (s.end.getTime() - s.start.getTime()) / 60_000 === 180,
    );
    expect(hasExactBoundarySlot).toBe(true);

    const endsAtBreakStart = canBook({
      start: localMinutesToUtc(FUTURE_DATE, 540),
      end: localMinutesToUtc(FUTURE_DATE, 720),
      qualified: true,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(endsAtBreakStart).toEqual({ ok: true });

    const crossesBreak = canBook({
      start: localMinutesToUtc(FUTURE_DATE, 650),
      end: localMinutesToUtc(FUTURE_DATE, 830),
      qualified: true,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(crossesBreak).toMatchObject({ ok: false, code: "INSIDE_BREAK" });
  });

  it("#9 overlapping appointment (starts before / ends inside / fully covers) -> rejected", () => {
    const candidate = { start: localMinutesToUtc(FUTURE_DATE, 600), end: localMinutesToUtc(FUTURE_DATE, 645) };
    const cases: Array<[number, number]> = [
      [580, 620], // starts before, ends inside
      [620, 660], // starts inside, ends after
      [580, 700], // fully covers
    ];
    for (const [startMin, endMin] of cases) {
      const result = canBook({
        ...candidate,
        qualified: true,
        staff: staffCtx({ busyIntervals: [{ startMin, endMin }] }),
        salonClosed: false,
        now: NOW,
        sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
        bookingWindowDays: BOOKING_WINDOW_DAYS,
      });
      expect(result).toMatchObject({ ok: false, code: "SLOT_UNAVAILABLE" });
    }
  });

  it("#10 same-day lead time (2h) -> slots before now+leadTime rejected, at the floor allowed", () => {
    const tooSoon = canBook({
      start: localMinutesToUtc(TODAY, 689),
      end: localMinutesToUtc(TODAY, 719),
      qualified: true,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(tooSoon).toMatchObject({ ok: false, code: "LEAD_TIME_VIOLATION" });

    const atFloor = canBook({
      start: localMinutesToUtc(TODAY, 690),
      end: localMinutesToUtc(TODAY, 720),
      qualified: true,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(atFloor).toEqual({ ok: true });
  });

  it("#11 booking window (30 days) -> beyond the window rejected", () => {
    const beyondWindow = "2024-02-01"; // 31 days after 2024-01-01
    const slots = findSlots(baseInput({ date: beyondWindow }));
    expect(slots).toEqual([]);

    const result = canBook({
      start: localMinutesToUtc(beyondWindow, 600),
      end: localMinutesToUtc(beyondWindow, 645),
      qualified: true,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(result).toMatchObject({ ok: false, code: "OUTSIDE_BOOKING_WINDOW" });
  });

  it("#12 salon closure -> whole day rejected", () => {
    const slots = findSlots(baseInput({ salonClosed: true }));
    expect(slots).toEqual([]);
  });

  it("#13 staff not qualified for a service -> rejected", () => {
    const result = canBook({
      start: localMinutesToUtc(FUTURE_DATE, 600),
      end: localMinutesToUtc(FUTURE_DATE, 645),
      qualified: false,
      staff: staffCtx(),
      salonClosed: false,
      now: NOW,
      sameDayLeadMinutes: SAME_DAY_LEAD_MIN,
      bookingWindowDays: BOOKING_WINDOW_DAYS,
    });
    expect(result).toMatchObject({ ok: false, code: "STAFF_NOT_QUALIFIED" });
  });

  it("#14 held slot hides that window from other queries", () => {
    // A SlotHold isn't its own concept inside the engine — it's just another
    // busy interval, the same mechanism proven for appointments in #5. Real
    // SlotHold rows are wired in by P10; this proves the mechanism itself.
    const slots = findSlots(
      baseInput({ staff: [staffCtx({ busyIntervals: [{ startMin: 540, endMin: 1020 }] })] }),
    );
    expect(slots).toEqual([]);
  });
});
