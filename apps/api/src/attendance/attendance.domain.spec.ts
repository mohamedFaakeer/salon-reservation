import { describe, expect, it } from "vitest";
import { AttendanceDayStatus } from "@salon/shared";
import {
  dayIsOver,
  earlyMinutesFor,
  lateMinutesFor,
  minutesFromMidnightOf,
  resolveStatus,
  workDateOf,
  workedMinutesBetween,
} from "./attendance.domain";

describe("minutesFromMidnightOf", () => {
  it("reads a normal daytime instant against its own day's midnight", () => {
    // 09:00 Colombo on 2026-08-20 = 03:30 UTC.
    expect(minutesFromMidnightOf("2026-08-20", new Date("2026-08-20T03:30:00Z"))).toBe(540);
  });

  it("scores a past-midnight finish against the day the shift started, not the calendar day it lands on", () => {
    // 00:20 Colombo on 2026-08-21 = 18:50 UTC on 2026-08-20 — but the shift is
    // "2026-08-20"'s, so it should read as minute 1460, not minute 20.
    expect(minutesFromMidnightOf("2026-08-20", new Date("2026-08-20T18:50:00Z"))).toBe(1460);
  });
});

describe("workDateOf", () => {
  it("returns the Colombo-local calendar date", () => {
    // 23:45 UTC on 2026-08-20 is 05:15 Colombo on 2026-08-21.
    expect(workDateOf(new Date("2026-08-20T23:45:00Z"))).toBe("2026-08-21");
  });
});

describe("lateMinutesFor", () => {
  it("is zero with no rostered start", () => {
    expect(lateMinutesFor(null, 10, 999)).toBe(0);
  });

  it("is zero for an on-time arrival inside the grace window", () => {
    expect(lateMinutesFor(540, 10, 549)).toBe(0);
  });

  it("is zero, not negative, for an early arrival", () => {
    expect(lateMinutesFor(540, 10, 500)).toBe(0);
  });

  it("counts only the minutes past the grace window", () => {
    expect(lateMinutesFor(540, 10, 560)).toBe(10);
  });
});

describe("earlyMinutesFor", () => {
  it("is zero with no rostered end", () => {
    expect(earlyMinutesFor(null, 10, 100)).toBe(0);
  });

  it("is zero for a departure inside the grace window", () => {
    expect(earlyMinutesFor(1080, 10, 1071)).toBe(0);
  });

  it("is zero, not negative, for staying late", () => {
    expect(earlyMinutesFor(1080, 10, 1100)).toBe(0);
  });

  it("counts only the minutes short of the grace window", () => {
    expect(earlyMinutesFor(1080, 10, 1050)).toBe(20);
  });
});

describe("workedMinutesBetween", () => {
  it("computes whole minutes worked", () => {
    expect(
      workedMinutesBetween(new Date("2026-08-20T03:30:00Z"), new Date("2026-08-20T11:00:00Z")),
    ).toBe(450);
  });
});

describe("resolveStatus", () => {
  it("is PRESENT while checked in and the shift has not ended", () => {
    expect(
      resolveStatus({
        hasCheckIn: true,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: false,
        dayIsOver: false,
      }),
    ).toBe(AttendanceDayStatus.PRESENT);
  });

  it("is PRESENT once checked out, even after the day is over", () => {
    expect(
      resolveStatus({
        hasCheckIn: true,
        hasCheckOut: true,
        rostered: true,
        onLeave: false,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.PRESENT);
  });

  it("is MISSING_CHECK_OUT once the shift has ended with no check-out recorded", () => {
    expect(
      resolveStatus({
        hasCheckIn: true,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.MISSING_CHECK_OUT);
  });

  it("prefers a recorded check-in over a same-day closure — a fact beats a plan", () => {
    expect(
      resolveStatus({
        hasCheckIn: true,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: true,
        dayIsOver: false,
      }),
    ).toBe(AttendanceDayStatus.PRESENT);
  });

  it("prefers a recorded check-in over approved leave — somebody who came in anyway was present", () => {
    expect(
      resolveStatus({
        hasCheckIn: true,
        hasCheckOut: true,
        rostered: false,
        onLeave: true,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.PRESENT);
  });

  it("is CLOSED with no punch on a salon closure", () => {
    expect(
      resolveStatus({
        hasCheckIn: false,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: true,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.CLOSED);
  });

  it("is ON_LEAVE with no punch on an approved leave day", () => {
    expect(
      resolveStatus({
        hasCheckIn: false,
        hasCheckOut: false,
        rostered: false,
        onLeave: true,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.ON_LEAVE);
  });

  it("is DAY_OFF with no punch and no rota for the weekday", () => {
    expect(
      resolveStatus({
        hasCheckIn: false,
        hasCheckOut: false,
        rostered: false,
        onLeave: false,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.DAY_OFF);
  });

  it("is EXPECTED when rostered, unpunched, and the shift has not ended yet — not an absence", () => {
    expect(
      resolveStatus({
        hasCheckIn: false,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: false,
        dayIsOver: false,
      }),
    ).toBe(AttendanceDayStatus.EXPECTED);
  });

  it("is ABSENT when rostered, unpunched, and the shift has ended", () => {
    expect(
      resolveStatus({
        hasCheckIn: false,
        hasCheckOut: false,
        rostered: true,
        onLeave: false,
        closed: false,
        dayIsOver: true,
      }),
    ).toBe(AttendanceDayStatus.ABSENT);
  });
});

describe("dayIsOver", () => {
  it("is always true for a date before today", () => {
    expect(dayIsOver("2026-08-01", 1080, new Date("2026-08-20T12:00:00Z"))).toBe(true);
  });

  it("is always false for a date after today", () => {
    expect(dayIsOver("2026-12-25", 1080, new Date("2026-08-20T12:00:00Z"))).toBe(false);
  });

  it("is false today before the rostered end has passed", () => {
    // 12:00 UTC = 17:30 Colombo = minute 1050, before an 18:00 (1080) end.
    expect(dayIsOver("2026-08-20", 1080, new Date("2026-08-20T12:00:00Z"))).toBe(false);
  });

  it("is true today once the rostered end has passed", () => {
    // 13:00 UTC = 18:30 Colombo = minute 1110, past an 18:00 (1080) end.
    expect(dayIsOver("2026-08-20", 1080, new Date("2026-08-20T13:00:00Z"))).toBe(true);
  });

  it("is never over today for someone with no rostered end", () => {
    // 15:00 UTC = 20:30 Colombo, still 2026-08-20 locally.
    expect(dayIsOver("2026-08-20", null, new Date("2026-08-20T15:00:00Z"))).toBe(false);
  });
});
