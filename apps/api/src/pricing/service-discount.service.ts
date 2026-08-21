import { Injectable } from "@nestjs/common";
import { DiscountType } from "@salon/shared";
import { colomboNow, dayOfWeekOf } from "../availability/time.util";

/**
 * Whether an offer is live at a given moment, and what it takes off.
 *
 * The single place a service discount is decided — CLAUDE.md §5. Nothing else
 * may work out a discounted price: the customer site, the admin booking
 * drawer, the availability quote and the invoice all have to agree, and four
 * implementations of "is it Tuesday evening yet" would eventually not.
 *
 * Pure functions over plain data, so the rule is testable without a database.
 */

export interface DiscountWindowLike {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface DiscountLike {
  type: DiscountType;
  value: number;
  startDate: string;
  endDate: string;
  label: string | null;
  active: boolean;
  windows?: DiscountWindowLike[];
}

export interface PricedService {
  /** What the service costs before any offer. */
  listPriceCents: number;
  /** Never more than the list price, and never negative. */
  discountCents: number;
  /** What the customer actually pays. */
  chargedCents: number;
  /** Null when no offer applied — the absence is meaningful, so it is explicit. */
  label: string | null;
}

@Injectable()
export class ServiceDiscountService {
  /**
   * Price one service for a moment in time.
   *
   * `at` is the **appointment's** start, never the moment of booking. A salon
   * advertising "Tuesday 20% off" means the chair is occupied on a Tuesday;
   * pricing it by when the customer happened to tap Book would discount a
   * Saturday appointment for anyone who booked it midweek.
   */
  priceAt(listPriceCents: number, discount: DiscountLike | null | undefined, at: Date): PricedService {
    const none: PricedService = {
      listPriceCents,
      discountCents: 0,
      chargedCents: listPriceCents,
      label: null,
    };

    if (!discount || !this.appliesAt(discount, at)) {
      return none;
    }

    const raw =
      discount.type === DiscountType.PERCENT
        ? Math.round((listPriceCents * discount.value) / 100)
        : discount.value;

    // Clamped at the line's own price. A fixed LKR 2,000 off a LKR 1,500
    // service is a mis-set offer, not a refund the salon owes.
    const discountCents = Math.max(0, Math.min(raw, listPriceCents));
    if (discountCents === 0) {
      return none;
    }

    return {
      listPriceCents,
      discountCents,
      chargedCents: listPriceCents - discountCents,
      label: discount.label ?? describe(discount),
    };
  }

  /**
   * Is the offer live at this instant?
   *
   * Both halves are evaluated in Colombo local time, because the offer is
   * written in the salon's own calendar: a booking at 00:30 local is 19:00 the
   * previous day in UTC, and judging "is it still September" on the UTC date
   * would end the offer half a day early for everyone.
   */
  appliesAt(discount: DiscountLike, at: Date): boolean {
    if (!discount.active) {
      return false;
    }

    const local = colomboNow(at);
    if (local.date < discount.startDate || local.date > discount.endDate) {
      return false;
    }

    const windows = discount.windows ?? [];
    if (windows.length === 0) {
      // No hours configured means all day, every day in range — the common
      // case ("20% off this September"), so it is the one needing no setup.
      return true;
    }

    const dow = dayOfWeekOf(local.date);
    return windows.some(
      (w) => w.dayOfWeek === dow && local.minutes >= w.startMin && local.minutes < w.endMin,
    );
  }
}

/**
 * What to call an offer nobody named.
 *
 * A blank badge on the customer's booking is worse than a plain one, and
 * "20% off" is what the salon would have typed anyway.
 */
function describe(discount: DiscountLike): string {
  return discount.type === DiscountType.PERCENT
    ? `${discount.value}% off`
    : `LKR ${(discount.value / 100).toLocaleString("en-LK")} off`;
}
