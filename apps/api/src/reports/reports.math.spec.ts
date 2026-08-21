import { AppointmentStatus } from "@salon/shared";
import {
  computeRosteredMinutes,
  daysApart,
  median,
  percentOrNull,
  rankServices,
  shiftDate,
  tallyLosses,
  withRate,
  type LeaveLike,
  type LossRow,
  type ShiftLike,
} from "./reports.math";

function shift(overrides: Partial<ShiftLike> = {}): ShiftLike {
  return {
    staffId: "staff-1",
    // 2026-03-02 is a Monday, which is dayOfWeek 0 in this schema.
    dayOfWeek: 0,
    startMin: 9 * 60,
    endMin: 17 * 60,
    breakStartMin: null,
    breakEndMin: null,
    ...overrides,
  };
}

function loss(overrides: Partial<LossRow> = {}): LossRow {
  return {
    status: AppointmentStatus.NO_SHOW,
    staffId: "staff-1",
    staffName: "Nadia",
    totalCents: 500_000,
    advancePaidCents: 0,
    hour: 10,
    ...overrides,
  };
}

describe("computeRosteredMinutes", () => {
  const mondays = ["2026-03-02", "2026-03-09"];

  it("sums the shift for each matching weekday in the range", () => {
    const result = computeRosteredMinutes(mondays, [shift()], [], []);

    expect(result.get("staff-1")).toBe(2 * 8 * 60);
  });

  it("subtracts the break", () => {
    const result = computeRosteredMinutes(
      ["2026-03-02"],
      [shift({ breakStartMin: 13 * 60, breakEndMin: 14 * 60 })],
      [],
      [],
    );

    expect(result.get("staff-1")).toBe(7 * 60);
  });

  it("skips a day the stylist is on leave", () => {
    const leave: LeaveLike = { staffId: "staff-1", startDate: "2026-03-09", endDate: "2026-03-09" };

    const result = computeRosteredMinutes(mondays, [shift()], [leave], []);

    expect(result.get("staff-1")).toBe(8 * 60);
  });

  it("skips a day the salon is closed, for everybody", () => {
    const result = computeRosteredMinutes(
      mondays,
      [shift(), shift({ staffId: "staff-2" })],
      [],
      [{ startDate: "2026-03-09", endDate: "2026-03-09" }],
    );

    expect(result.get("staff-1")).toBe(8 * 60);
    expect(result.get("staff-2")).toBe(8 * 60);
  });

  it("handles a leave span covering several days", () => {
    const leave: LeaveLike = { staffId: "staff-1", startDate: "2026-03-01", endDate: "2026-03-31" };

    expect(computeRosteredMinutes(mondays, [shift()], [leave], []).get("staff-1")).toBeUndefined();
  });

  it("does not let one stylist's leave affect another", () => {
    const leave: LeaveLike = { staffId: "staff-2", startDate: "2026-03-02", endDate: "2026-03-02" };

    const result = computeRosteredMinutes(["2026-03-02"], [shift(), shift({ staffId: "staff-2" })], [leave], []);

    expect(result.get("staff-1")).toBe(8 * 60);
    expect(result.get("staff-2")).toBeUndefined();
  });

  it("ignores shifts for other weekdays", () => {
    // dayOfWeek 2 is Wednesday; the range holds only Mondays.
    expect(computeRosteredMinutes(mondays, [shift({ dayOfWeek: 2 })], [], []).size).toBe(0);
  });

  it("never returns negative minutes for a break longer than the shift", () => {
    const result = computeRosteredMinutes(
      ["2026-03-02"],
      [shift({ startMin: 600, endMin: 660, breakStartMin: 0, breakEndMin: 600 })],
      [],
      [],
    );

    expect(result.get("staff-1")).toBe(0);
  });
});

describe("tallyLosses", () => {
  it("counts no-shows and cancellations separately and sums what they cost", () => {
    const report = tallyLosses([
      loss({ status: AppointmentStatus.NO_SHOW, totalCents: 300_000 }),
      loss({ status: AppointmentStatus.CANCELLED, totalCents: 200_000 }),
    ]);

    expect(report.noShows).toBe(1);
    expect(report.cancellations).toBe(1);
    expect(report.lostRevenueCents).toBe(500_000);
  });

  it("does not count a completed appointment as a loss", () => {
    const report = tallyLosses([loss({ status: AppointmentStatus.COMPLETED })]);

    expect(report.lostRevenueCents).toBe(0);
    expect(report.byStaff).toEqual([]);
  });

  it("ranks staff by what their empty chairs cost", () => {
    const report = tallyLosses([
      loss({ staffId: "a", staffName: "Ayesha", totalCents: 100_000 }),
      loss({ staffId: "b", staffName: "Nadia", totalCents: 900_000 }),
    ]);

    expect(report.byStaff.map((r) => r.name)).toEqual(["Nadia", "Ayesha"]);
  });

  it("keeps a departed stylist's losses rather than dropping the row", () => {
    const report = tallyLosses([loss({ staffName: null })]);

    expect(report.byStaff[0].name).toBe("Removed stylist");
  });

  it("orders the hourly breakdown by hour", () => {
    const report = tallyLosses([loss({ hour: 16 }), loss({ hour: 9 }), loss({ hour: 12 })]);

    expect(report.byHour.map((h) => h.hour)).toEqual([9, 12, 16]);
  });

  describe("deposit effect", () => {
    it("splits concluded appointments by whether an advance was paid", () => {
      const report = tallyLosses([
        loss({ status: AppointmentStatus.COMPLETED, advancePaidCents: 100_000 }),
        loss({ status: AppointmentStatus.NO_SHOW, advancePaidCents: 100_000 }),
        loss({ status: AppointmentStatus.COMPLETED, advancePaidCents: 0 }),
        loss({ status: AppointmentStatus.NO_SHOW, advancePaidCents: 0 }),
        loss({ status: AppointmentStatus.NO_SHOW, advancePaidCents: 0 }),
      ]);

      expect(report.depositEffect.withDeposit).toMatchObject({ concluded: 2, noShows: 1, noShowPercent: 50 });
      expect(report.depositEffect.withoutDeposit).toMatchObject({ concluded: 3, noShows: 2, noShowPercent: 67 });
    });

    it("excludes cancellations, which are the customer doing the right thing", () => {
      const report = tallyLosses([
        loss({ status: AppointmentStatus.CANCELLED, advancePaidCents: 0 }),
        loss({ status: AppointmentStatus.COMPLETED, advancePaidCents: 0 }),
      ]);

      expect(report.depositEffect.withoutDeposit.concluded).toBe(1);
    });

    it("reports null, not zero, when a group has nothing concluded", () => {
      const report = tallyLosses([loss({ status: AppointmentStatus.COMPLETED, advancePaidCents: 0 })]);

      // Zero would read as "deposits give a perfect record" on no evidence.
      expect(report.depositEffect.withDeposit.noShowPercent).toBeNull();
      expect(report.depositEffect.withoutDeposit.noShowPercent).toBe(0);
    });
  });
});

describe("withRate and percentOrNull", () => {
  it("returns null on an empty denominator", () => {
    expect(withRate({ concluded: 0, noShows: 0 }).noShowPercent).toBeNull();
    expect(percentOrNull(0, 0)).toBeNull();
  });

  it("rounds to whole percent", () => {
    expect(percentOrNull(1, 3)).toBe(33);
  });
});

describe("median", () => {
  it("is null for nothing", () => {
    expect(median([])).toBeNull();
  });

  it("takes the middle of an odd-length set", () => {
    expect(median([1, 5, 2])).toBe(2);
  });

  it("averages the middle two of an even-length set", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("is not moved by one forgotten outlier, which a mean would be", () => {
    expect(median([1, 1, 2, 2, 365])).toBe(2);
  });
});

describe("rankServices", () => {
  const rows = [
    { name: "Fringe Trim", count: 40, revenueCents: 40_000 },
    { name: "Balayage", count: 6, revenueCents: 900_000 },
    { name: "Cut & Blow Dry", count: 25, revenueCents: 375_000 },
  ];

  it("ranks popularity by count", () => {
    expect(rankServices(rows, 3).popular.map((r) => r.name)).toEqual([
      "Fringe Trim",
      "Cut & Blow Dry",
      "Balayage",
    ]);
  });

  it("ranks revenue by money, which is a different order", () => {
    // The whole point of showing both: the most-booked service earns least.
    expect(rankServices(rows, 3).byRevenue.map((r) => r.name)).toEqual([
      "Balayage",
      "Cut & Blow Dry",
      "Fringe Trim",
    ]);
  });

  it("honours the top-N cut", () => {
    expect(rankServices(rows, 2).popular).toHaveLength(2);
  });

  it("does not mutate the caller's array", () => {
    const original = [...rows];
    rankServices(rows, 3);
    expect(rows).toEqual(original);
  });
});

describe("date helpers", () => {
  it("shifts backwards across a month boundary", () => {
    expect(shiftDate("2026-03-02", -60)).toBe("2026-01-01");
  });

  it("counts days apart", () => {
    expect(daysApart("2026-01-01", "2026-03-02")).toBe(60);
  });
});
