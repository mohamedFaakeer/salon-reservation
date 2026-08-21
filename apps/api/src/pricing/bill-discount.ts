import { DiscountType } from "@salon/shared";

/**
 * The desk's discount on a bill that may already carry service offers.
 *
 * Pure functions, kept out of the service so the arithmetic — which is where
 * a mistake is silent and expensive — can be tested on its own.
 */

export interface BillDiscountInput {
  type: DiscountType;
  /** Cents when FIXED, whole percent when PERCENT. Zero clears it. */
  value: number;
}

/**
 * What the desk's discount takes off, applied **after** any service offers.
 *
 * Sequential, not additive: a service already discounted 20% to LKR 4,000 and
 * then given 10% at the desk lands at LKR 3,600, which is what anybody expects
 * a second discount to do. Additive would take both off the original and can
 * drive a bill to nothing with two ordinary-looking numbers.
 *
 * Clamped at what is still owed after the offers. A fixed LKR 2,000 off a
 * LKR 1,500 remainder makes the visit free; it never makes it a debt.
 */
export function billDiscountCents(
  subtotalCents: number,
  serviceDiscountCents: number,
  discount: BillDiscountInput | null,
): number {
  if (!discount || discount.value <= 0) {
    return 0;
  }
  const afterOffers = Math.max(0, subtotalCents - serviceDiscountCents);
  const raw =
    discount.type === DiscountType.PERCENT
      ? Math.round((afterOffers * discount.value) / 100)
      : discount.value;

  return Math.max(0, Math.min(raw, afterOffers));
}

/**
 * How much of the bill is being given away, as a whole percent.
 *
 * The cap is expressed this way so one number governs both kinds of discount:
 * a receptionist waving LKR 500 off an LKR 800 bill is giving away 63%,
 * however it was typed, and a cap that only understood percentages would let
 * that through.
 *
 * Measured against what was owed after the salon's own published offers,
 * because a customer arriving into a 20% promotion has not used up the
 * receptionist's discretion.
 */
export function discountSharePercent(
  subtotalCents: number,
  serviceDiscountCents: number,
  discountCents: number,
): number {
  const afterOffers = Math.max(0, subtotalCents - serviceDiscountCents);
  if (afterOffers === 0) {
    // Nothing was owed, so nothing is being given away. Treating this as 100%
    // would block a zero-value correction for no reason.
    return 0;
  }
  return Math.ceil((discountCents / afterOffers) * 100);
}
