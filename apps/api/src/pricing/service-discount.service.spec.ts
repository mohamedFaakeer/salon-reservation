import { DiscountType } from "@salon/shared";
import { ServiceDiscountService, type DiscountLike } from "./service-discount.service";

/**
 * Colombo is UTC+05:30 with no DST, so every instant below is written as the
 * UTC that produces the intended local time. 2026-09-01 is a Tuesday.
 */
function at(localDate: string, localHour: number, localMinute = 0): Date {
  const utcMinutes = localHour * 60 + localMinute - 330;
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + utcMinutes * 60_000);
}

function offer(overrides: Partial<DiscountLike> = {}): DiscountLike {
  return {
    type: DiscountType.PERCENT,
    value: 20,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    label: null,
    active: true,
    ...overrides,
  };
}

describe("ServiceDiscountService", () => {
  const service = new ServiceDiscountService();
  const PRICE = 500_000;

  describe("no offer", () => {
    it("charges the list price when there is none", () => {
      const priced = service.priceAt(PRICE, null, at("2026-09-01", 10));

      expect(priced).toEqual({
        listPriceCents: PRICE,
        discountCents: 0,
        chargedCents: PRICE,
        label: null,
      });
    });

    it("ignores an offer that has been switched off", () => {
      const priced = service.priceAt(PRICE, offer({ active: false }), at("2026-09-01", 10));

      expect(priced.discountCents).toBe(0);
    });
  });

  describe("date range", () => {
    it("applies on the first day", () => {
      expect(service.priceAt(PRICE, offer(), at("2026-09-01", 10)).discountCents).toBe(100_000);
    });

    it("applies on the last day, which is inclusive", () => {
      expect(service.priceAt(PRICE, offer(), at("2026-09-30", 23)).discountCents).toBe(100_000);
    });

    it("does not apply the day before it starts", () => {
      expect(service.priceAt(PRICE, offer(), at("2026-08-31", 10)).discountCents).toBe(0);
    });

    it("does not apply the day after it ends", () => {
      expect(service.priceAt(PRICE, offer(), at("2026-10-01", 10)).discountCents).toBe(0);
    });

    it("judges the date in Colombo, not UTC", () => {
      // 2026-09-30T19:00Z is already 00:30 on 1 October in Colombo, so the
      // September offer is over. Judging on the UTC date would extend it.
      const justAfterMidnightLocal = new Date("2026-09-30T19:00:00.000Z");

      expect(service.priceAt(PRICE, offer(), justAfterMidnightLocal).discountCents).toBe(0);
    });

    it("does not end the offer half a day early", () => {
      // The mirror of the case above: 2026-09-01T00:00Z is still 31 August
      // locally, but 05:30 local on the 1st is inside the offer.
      expect(service.priceAt(PRICE, offer(), at("2026-09-01", 5, 30)).discountCents).toBe(100_000);
    });
  });

  describe("weekly windows", () => {
    // 2026-09-01 is a Tuesday, which is dayOfWeek 1 in this schema.
    const tuesdayEvening = offer({ windows: [{ dayOfWeek: 1, startMin: 17 * 60, endMin: 20 * 60 }] });

    it("applies inside the window", () => {
      expect(service.priceAt(PRICE, tuesdayEvening, at("2026-09-01", 18)).discountCents).toBe(100_000);
    });

    it("applies at the opening minute", () => {
      expect(service.priceAt(PRICE, tuesdayEvening, at("2026-09-01", 17)).discountCents).toBe(100_000);
    });

    it("has ended by the closing minute, which is exclusive", () => {
      // An appointment starting exactly at 20:00 is after the offer, not in
      // its last minute — otherwise two adjacent windows would both claim it.
      expect(service.priceAt(PRICE, tuesdayEvening, at("2026-09-01", 20)).discountCents).toBe(0);
    });

    it("does not apply before the window opens", () => {
      expect(service.priceAt(PRICE, tuesdayEvening, at("2026-09-01", 16, 59)).discountCents).toBe(0);
    });

    it("does not apply on another weekday", () => {
      // 2026-09-02 is a Wednesday.
      expect(service.priceAt(PRICE, tuesdayEvening, at("2026-09-02", 18)).discountCents).toBe(0);
    });

    it("treats an empty window list as all day", () => {
      const allDay = offer({ windows: [] });

      expect(service.priceAt(PRICE, allDay, at("2026-09-02", 3)).discountCents).toBe(100_000);
      expect(service.priceAt(PRICE, allDay, at("2026-09-02", 23, 59)).discountCents).toBe(100_000);
    });

    it("matches any one of several windows", () => {
      const twoDays = offer({
        windows: [
          { dayOfWeek: 1, startMin: 17 * 60, endMin: 20 * 60 },
          { dayOfWeek: 4, startMin: 10 * 60, endMin: 13 * 60 },
        ],
      });

      // Friday 2026-09-04 is dayOfWeek 4.
      expect(service.priceAt(PRICE, twoDays, at("2026-09-04", 11)).discountCents).toBe(100_000);
      expect(service.priceAt(PRICE, twoDays, at("2026-09-04", 18)).discountCents).toBe(0);
    });

    it("covers the last minute of the day when a window ends at 1440", () => {
      const untilMidnight = offer({ windows: [{ dayOfWeek: 1, startMin: 0, endMin: 1440 }] });

      expect(service.priceAt(PRICE, untilMidnight, at("2026-09-01", 23, 59)).discountCents).toBe(100_000);
    });
  });

  describe("amounts", () => {
    it("takes a percentage of the list price", () => {
      expect(service.priceAt(PRICE, offer({ value: 15 }), at("2026-09-01", 10)).discountCents).toBe(75_000);
    });

    it("rounds a percentage to the cent", () => {
      // 33% of 1,001 cents is 330.33.
      expect(service.priceAt(1_001, offer({ value: 33 }), at("2026-09-01", 10)).discountCents).toBe(330);
    });

    it("takes a fixed amount as given", () => {
      const fixed = offer({ type: DiscountType.FIXED, value: 120_000 });

      const priced = service.priceAt(PRICE, fixed, at("2026-09-01", 10));

      expect(priced.discountCents).toBe(120_000);
      expect(priced.chargedCents).toBe(380_000);
    });

    it("never discounts more than the service costs", () => {
      // A mis-set offer makes the service free, never a debt to the customer.
      const tooBig = offer({ type: DiscountType.FIXED, value: 900_000 });

      const priced = service.priceAt(PRICE, tooBig, at("2026-09-01", 10));

      expect(priced.discountCents).toBe(PRICE);
      expect(priced.chargedCents).toBe(0);
    });

    it("reports no discount when a percentage rounds to nothing", () => {
      // 1% of 20 cents is 0.2, which rounds to zero. Reporting an offer that
      // took nothing off would put a badge on an undiscounted price.
      const priced = service.priceAt(20, offer({ value: 1 }), at("2026-09-01", 10));

      expect(priced.discountCents).toBe(0);
      expect(priced.label).toBeNull();
    });
  });

  describe("labels", () => {
    it("uses the salon's own words when it has them", () => {
      const named = offer({ label: "September sale" });

      expect(service.priceAt(PRICE, named, at("2026-09-01", 10)).label).toBe("September sale");
    });

    it("describes a percentage offer nobody named", () => {
      expect(service.priceAt(PRICE, offer(), at("2026-09-01", 10)).label).toBe("20% off");
    });

    it("describes a fixed offer nobody named", () => {
      const fixed = offer({ type: DiscountType.FIXED, value: 150_000 });

      expect(service.priceAt(PRICE, fixed, at("2026-09-01", 10)).label).toBe("LKR 1,500 off");
    });
  });
});
