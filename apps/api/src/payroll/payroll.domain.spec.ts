import { PayFrequency } from "@salon/shared";
import { describe, expect, it } from "vitest";
import { dayBefore, isFullCalendarMonth, resolvePayPeriod } from "./payroll.domain";

describe("resolvePayPeriod", () => {
  it("a DAILY period is just the one day", () => {
    expect(resolvePayPeriod(PayFrequency.DAILY, "2026-09-15")).toEqual({ start: "2026-09-15", end: "2026-09-15" });
  });

  describe("MONTHLY with the default calendar-month anchor (day 1)", () => {
    it("a mid-month date falls inside that calendar month", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-09-15")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    });

    it("the first of the month is itself the period start", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-09-01")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    });

    it("handles a 31-day and a 28-day month, and a leap February", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-01-31")).toEqual({ start: "2026-01-01", end: "2026-01-31" });
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2027-02-10")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    });
  });

  describe("MONTHLY with a custom anchor day", () => {
    it("a date on or after the anchor starts this month's cycle", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-09-25", { monthlyAnchorDay: 21 })).toEqual({
        start: "2026-09-21",
        end: "2026-10-20",
      });
    });

    it("a date before the anchor belongs to last month's cycle", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-09-15", { monthlyAnchorDay: 21 })).toEqual({
        start: "2026-08-21",
        end: "2026-09-20",
      });
    });

    it("carries the cycle correctly across a year boundary", () => {
      expect(resolvePayPeriod(PayFrequency.MONTHLY, "2026-01-05", { monthlyAnchorDay: 21 })).toEqual({
        start: "2025-12-21",
        end: "2026-01-20",
      });
    });
  });
});

describe("dayBefore", () => {
  it("steps back one calendar day", () => {
    expect(dayBefore("2026-09-15")).toBe("2026-09-14");
  });

  it("crosses a month boundary", () => {
    expect(dayBefore("2026-09-01")).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});

describe("isFullCalendarMonth", () => {
  it("true for the 1st through the last day of a 30-day, 31-day, and leap-February month", () => {
    expect(isFullCalendarMonth("2026-09-01", "2026-09-30")).toBe(true);
    expect(isFullCalendarMonth("2026-01-01", "2026-01-31")).toBe(true);
    expect(isFullCalendarMonth("2028-02-01", "2028-02-29")).toBe(true);
  });

  it("false when it doesn't start on the 1st", () => {
    expect(isFullCalendarMonth("2026-09-02", "2026-09-30")).toBe(false);
  });

  it("false when it doesn't end on the month's last day", () => {
    expect(isFullCalendarMonth("2026-09-01", "2026-09-29")).toBe(false);
    expect(isFullCalendarMonth("2026-09-01", "2026-10-01")).toBe(false);
  });

  it("ignores any tenant PayCalendar anchor — always the Gregorian calendar month", () => {
    expect(isFullCalendarMonth("2026-09-21", "2026-10-20")).toBe(false);
  });
});
