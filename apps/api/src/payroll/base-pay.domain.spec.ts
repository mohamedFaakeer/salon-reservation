import { AttendanceDayStatus, PayFrequency } from "@salon/shared";
import { describe, expect, it } from "vitest";
import { computeBasePay, type BasePayDayInput } from "./base-pay.domain";

function day(overrides: Partial<BasePayDayInput> = {}): BasePayDayInput {
  return {
    date: "2026-09-15",
    payFrequency: PayFrequency.MONTHLY,
    baseRateCents: 30_00000, // 300,000 cents = Rs. 3,000/day equivalent at /30
    attendanceStatus: AttendanceDayStatus.PRESENT,
    leavePaid: null,
    ...overrides,
  };
}

describe("computeBasePay", () => {
  it("a date with no Employment version earns nothing and is flagged", () => {
    const result = computeBasePay([day({ payFrequency: null, baseRateCents: null })]);
    expect(result.earnedCents).toBe(0);
    expect(result.daysWithoutEmployment).toBe(1);
    expect(result.days[0].note).toBe("NO_EMPLOYMENT");
  });

  describe("MONTHLY", () => {
    it("an ordinary day earns exactly one thirtieth of the monthly rate", () => {
      const result = computeBasePay([day({ baseRateCents: 300_000 })]);
      expect(result.days[0].earnedCents).toBe(10_000);
      expect(result.earnedCents).toBe(10_000);
    });

    it("a confirmed unpaid absence (ABSENT) earns nothing and is counted", () => {
      const result = computeBasePay([day({ baseRateCents: 300_000, attendanceStatus: AttendanceDayStatus.ABSENT })]);
      expect(result.days[0].earnedCents).toBe(0);
      expect(result.days[0].note).toBe("UNPAID_ABSENCE");
      expect(result.unpaidAbsenceDays).toBe(1);
    });

    it("a day off, on-leave, or missing-checkout day is NOT treated as an unpaid absence", () => {
      for (const status of [AttendanceDayStatus.DAY_OFF, AttendanceDayStatus.ON_LEAVE, AttendanceDayStatus.MISSING_CHECK_OUT]) {
        const result = computeBasePay([day({ baseRateCents: 300_000, attendanceStatus: status })]);
        expect(result.days[0].earnedCents).toBe(10_000);
        expect(result.unpaidAbsenceDays).toBe(0);
      }
    });

    it("a whole 30-day period of full attendance sums to the full monthly rate (rounding included)", () => {
      const days = Array.from({ length: 30 }, (_, i) => day({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, baseRateCents: 300_000 }));
      const result = computeBasePay(days);
      expect(result.earnedCents).toBe(300_000);
    });
  });

  describe("DAILY", () => {
    it("a worked day (present) earns the full daily rate", () => {
      const result = computeBasePay([day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.PRESENT })]);
      expect(result.days[0].earnedCents).toBe(5_000);
      expect(result.days[0].note).toBe("WORKED");
    });

    it("present with a missing checkout still counts as worked, not an exception against pay", () => {
      const result = computeBasePay([
        day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.MISSING_CHECK_OUT }),
      ]);
      expect(result.days[0].earnedCents).toBe(5_000);
      expect(result.days[0].note).toBe("WORKED");
    });

    it("an ON_LEAVE day earns the daily rate only when the covering leave is paid", () => {
      const paid = computeBasePay([day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.ON_LEAVE, leavePaid: true })]);
      expect(paid.days[0].earnedCents).toBe(5_000);
      expect(paid.days[0].note).toBe("PAID_LEAVE");

      const unpaid = computeBasePay([day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.ON_LEAVE, leavePaid: false })]);
      expect(unpaid.days[0].earnedCents).toBe(0);
      expect(unpaid.days[0].note).toBe("UNPAID_LEAVE");
    });

    it("a closure day earns nothing but is flagged unresolved, never silently assumed either way", () => {
      const result = computeBasePay([day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.CLOSED })]);
      expect(result.days[0].earnedCents).toBe(0);
      expect(result.days[0].note).toBe("CLOSURE_UNRESOLVED");
      expect(result.unresolvedClosureDays).toBe(1);
    });

    it("an unauthorised absence, a day off, or a not-yet-over day earns nothing and isn't flagged as anything special", () => {
      for (const status of [AttendanceDayStatus.ABSENT, AttendanceDayStatus.DAY_OFF, AttendanceDayStatus.EXPECTED]) {
        const result = computeBasePay([day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: status })]);
        expect(result.days[0].earnedCents).toBe(0);
        expect(result.days[0].note).toBe("NOT_PAYABLE");
      }
      // None of these should be counted as an "unpaid absence" (a MONTHLY-only concept) or a closure.
      const allStatuses = [AttendanceDayStatus.ABSENT, AttendanceDayStatus.DAY_OFF, AttendanceDayStatus.EXPECTED];
      const result = computeBasePay(allStatuses.map((s) => day({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: s })));
      expect(result.unpaidAbsenceDays).toBe(0);
      expect(result.unresolvedClosureDays).toBe(0);
    });
  });

  it("mixes MONTHLY and DAILY days in the same period (a mid-period frequency change) without cross-contaminating totals", () => {
    const result = computeBasePay([
      day({ date: "2026-09-01", payFrequency: PayFrequency.MONTHLY, baseRateCents: 300_000, attendanceStatus: AttendanceDayStatus.PRESENT }),
      day({ date: "2026-09-02", payFrequency: PayFrequency.DAILY, baseRateCents: 5_000, attendanceStatus: AttendanceDayStatus.PRESENT }),
    ]);
    expect(result.earnedCents).toBe(10_000 + 5_000);
    expect(result.days[0].note).toBe("MONTHLY_DAY");
    expect(result.days[1].note).toBe("WORKED");
  });
});
