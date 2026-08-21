import { DiscountType } from "@salon/shared";
import { billDiscountCents, discountSharePercent } from "./bill-discount";

describe("billDiscountCents", () => {
  const SUBTOTAL = 500_000;

  it("is nothing when no discount was given", () => {
    expect(billDiscountCents(SUBTOTAL, 0, null)).toBe(0);
  });

  it("is nothing when the value is zero, which is how a discount is cleared", () => {
    expect(billDiscountCents(SUBTOTAL, 0, { type: DiscountType.PERCENT, value: 0 })).toBe(0);
  });

  it("takes a percentage of the whole bill when no offer applied", () => {
    expect(billDiscountCents(SUBTOTAL, 0, { type: DiscountType.PERCENT, value: 10 })).toBe(50_000);
  });

  it("takes a fixed amount as given", () => {
    expect(billDiscountCents(SUBTOTAL, 0, { type: DiscountType.FIXED, value: 75_000 })).toBe(75_000);
  });

  describe("stacking on a service offer", () => {
    // A LKR 5,000 service already discounted 20% to LKR 4,000.
    const OFFER = 100_000;

    it("applies to what is left, not to the original", () => {
      // 10% of 4,000 is 400 — not 500. Sequential, as agreed: the customer
      // ends up 28% down on the list price, which is what a second discount
      // is understood to do.
      expect(billDiscountCents(SUBTOTAL, OFFER, { type: DiscountType.PERCENT, value: 10 })).toBe(
        40_000,
      );
    });

    it("caps a fixed amount at what is still owed", () => {
      // LKR 5,000 off a LKR 4,000 remainder makes the visit free, never a debt.
      expect(billDiscountCents(SUBTOTAL, OFFER, { type: DiscountType.FIXED, value: 500_000 })).toBe(
        400_000,
      );
    });

    it("gives nothing away when the offer already took everything", () => {
      expect(
        billDiscountCents(SUBTOTAL, SUBTOTAL, { type: DiscountType.PERCENT, value: 50 }),
      ).toBe(0);
    });
  });

  it("never returns more than the bill", () => {
    expect(billDiscountCents(SUBTOTAL, 0, { type: DiscountType.PERCENT, value: 100 })).toBe(
      SUBTOTAL,
    );
  });

  it("rounds a percentage to the cent", () => {
    // 33% of 1,001 is 330.33.
    expect(billDiscountCents(1_001, 0, { type: DiscountType.PERCENT, value: 33 })).toBe(330);
  });
});

describe("discountSharePercent", () => {
  it("reads a percentage discount back as itself", () => {
    expect(discountSharePercent(500_000, 0, 50_000)).toBe(10);
  });

  it("reads a fixed discount as the share of the bill it actually is", () => {
    // This is the whole reason the cap is expressed as a percentage: LKR 500
    // off an LKR 800 bill is 63% given away, however it was typed, and a cap
    // that only understood percentages would wave it through.
    expect(discountSharePercent(80_000, 0, 50_000)).toBe(63);
  });

  it("measures against what was owed after the salon's own offers", () => {
    // A customer arriving into a 20% promotion has not spent the
    // receptionist's discretion: 400 off the remaining 4,000 is 10%, not 8%.
    expect(discountSharePercent(500_000, 100_000, 40_000)).toBe(10);
  });

  it("rounds up, so a hair over the cap is over the cap", () => {
    // 10.1% must not pass a 10% cap by rounding down.
    expect(discountSharePercent(100_000, 0, 10_100)).toBe(11);
  });

  it("is zero when nothing was owed", () => {
    // Nothing is being given away, so a zero-value correction is not blocked
    // by an imaginary 100%.
    expect(discountSharePercent(0, 0, 0)).toBe(0);
    expect(discountSharePercent(500_000, 500_000, 0)).toBe(0);
  });

  it("is 100 when the whole remaining bill is waived", () => {
    expect(discountSharePercent(500_000, 0, 500_000)).toBe(100);
  });
});
