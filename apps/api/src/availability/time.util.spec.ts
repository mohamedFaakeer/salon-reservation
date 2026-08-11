import { colomboNow, dayOfWeekOf, daysBetween, localMinutesToUtc } from "./time.util";

describe("time.util (Asia/Colombo fixed +05:30 offset)", () => {
  describe("dayOfWeekOf", () => {
    it("maps a known Monday to 0", () => {
      expect(dayOfWeekOf("2024-01-01")).toBe(0);
    });

    it("maps a known Sunday to 6", () => {
      expect(dayOfWeekOf("2024-01-07")).toBe(6);
    });

    it("maps a known Wednesday to 2", () => {
      expect(dayOfWeekOf("2024-01-03")).toBe(2);
    });
  });

  describe("localMinutesToUtc", () => {
    it("local midnight is UTC 18:30 the previous day", () => {
      const result = localMinutesToUtc("2024-01-01", 0);
      expect(result.toISOString()).toBe("2023-12-31T18:30:00.000Z");
    });

    it("local 05:30 is UTC midnight the same calendar day", () => {
      const result = localMinutesToUtc("2024-01-01", 330);
      expect(result.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("colomboNow", () => {
    it("shifts a UTC instant forward by the fixed offset", () => {
      expect(colomboNow(new Date("2024-01-01T00:00:00.000Z"))).toEqual({
        date: "2024-01-01",
        minutes: 330,
      });
    });

    it("rolls over into the next calendar day near UTC midnight", () => {
      expect(colomboNow(new Date("2023-12-31T20:00:00.000Z"))).toEqual({
        date: "2024-01-01",
        minutes: 90,
      });
    });
  });

  describe("daysBetween", () => {
    it("computes the calendar-day difference", () => {
      expect(daysBetween("2024-01-01", "2024-01-31")).toBe(30);
    });

    it("returns a negative number when b is before a", () => {
      expect(daysBetween("2024-01-31", "2024-01-01")).toBe(-30);
    });

    it("returns 0 for the same date", () => {
      expect(daysBetween("2024-01-01", "2024-01-01")).toBe(0);
    });
  });
});
