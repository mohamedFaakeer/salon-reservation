import { datesIn, resolveDateRange, utcWindowFor } from "./date-range";

/** 2026-03-15T04:00:00Z is 09:30 on the 15th in Colombo (UTC+05:30). */
const NOW = new Date("2026-03-15T04:00:00.000Z");

describe("resolveDateRange", () => {
  it("defaults to today when neither bound is given", () => {
    const range = resolveDateRange(undefined, undefined, NOW);

    expect(range).toMatchObject({ from: "2026-03-15", to: "2026-03-15", days: 1 });
  });

  it("treats a lone start as a single day", () => {
    expect(resolveDateRange("2026-03-01", undefined, NOW)).toMatchObject({
      from: "2026-03-01",
      to: "2026-03-01",
      days: 1,
    });
  });

  it("counts days inclusively, so one day is 1 and not 0", () => {
    expect(resolveDateRange("2026-03-01", "2026-03-07", NOW).days).toBe(7);
  });

  it("rejects an end before the start", () => {
    expect(() => resolveDateRange("2026-03-07", "2026-03-01", NOW)).toThrow(
      expect.objectContaining({ statusCode: 400, code: "INVALID_DATE_RANGE" }),
    );
  });

  it("rejects a range wider than a year and a day", () => {
    expect(() => resolveDateRange("2024-01-01", "2026-01-01", NOW)).toThrow(
      expect.objectContaining({ code: "DATE_RANGE_TOO_WIDE" }),
    );
  });

  it("allows exactly the maximum", () => {
    // 366 days apart is the boundary the guard permits, not one past it.
    expect(() => resolveDateRange("2026-01-01", "2027-01-02", NOW)).not.toThrow();
  });

  describe("includesToday", () => {
    it("is true when today sits inside the range", () => {
      expect(resolveDateRange("2026-03-01", "2026-03-31", NOW).includesToday).toBe(true);
    });

    it("is true on the boundaries", () => {
      expect(resolveDateRange("2026-03-15", "2026-03-20", NOW).includesToday).toBe(true);
      expect(resolveDateRange("2026-03-01", "2026-03-15", NOW).includesToday).toBe(true);
    });

    it("is false for a range that has already ended", () => {
      expect(resolveDateRange("2026-02-01", "2026-02-28", NOW).includesToday).toBe(false);
    });
  });

  it("uses the Colombo calendar day, not the UTC one", () => {
    // 20:00 UTC on the 14th is already 01:30 on the 15th in Colombo. A report
    // opened then must say "today" is the 15th, or the salon's evening
    // bookings land in yesterday.
    const lateUtc = new Date("2026-03-14T20:00:00.000Z");

    expect(resolveDateRange(undefined, undefined, lateUtc).from).toBe("2026-03-15");
  });
});

describe("utcWindowFor", () => {
  it("starts at local midnight, which is 18:30 UTC the previous day", () => {
    const { startUtc } = utcWindowFor({ from: "2026-03-15", to: "2026-03-15" });

    expect(startUtc.toISOString()).toBe("2026-03-14T18:30:00.000Z");
  });

  it("ends exclusively at the next local midnight, so the last day is whole", () => {
    const { endUtc } = utcWindowFor({ from: "2026-03-15", to: "2026-03-15" });

    expect(endUtc.toISOString()).toBe("2026-03-15T18:30:00.000Z");
  });

  it("covers a payment taken at 4am local, which UTC would file a day early", () => {
    // This is the bug the helper exists to prevent: 04:00 Colombo on the 15th
    // is 22:30 UTC on the 14th, which a naive date comparison files under the
    // 14th's takings.
    const fourAmLocal = new Date("2026-03-14T22:30:00.000Z");
    const { startUtc, endUtc } = utcWindowFor({ from: "2026-03-15", to: "2026-03-15" });

    expect(fourAmLocal >= startUtc && fourAmLocal < endUtc).toBe(true);
  });

  it("spans a multi-day range end to end", () => {
    const { startUtc, endUtc } = utcWindowFor({ from: "2026-03-01", to: "2026-03-31" });

    expect(startUtc.toISOString()).toBe("2026-02-28T18:30:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-03-31T18:30:00.000Z");
  });
});

describe("datesIn", () => {
  it("includes both ends", () => {
    expect(datesIn({ from: "2026-03-01", to: "2026-03-04" })).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ]);
  });

  it("returns the single day for a one-day range", () => {
    expect(datesIn({ from: "2026-03-01", to: "2026-03-01" })).toEqual(["2026-03-01"]);
  });

  it("crosses a month boundary", () => {
    expect(datesIn({ from: "2026-02-27", to: "2026-03-02" })).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });
});
