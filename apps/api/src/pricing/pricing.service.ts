import { Injectable } from "@nestjs/common";
import { AdvanceRule, type TenantSettings } from "@salon/shared";

export interface AppointmentTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  advanceRequiredCents: number;
  balanceCents: number;
}

/** Anything carrying a snapshotted list price and the discount taken off it. */
export interface PricedLine {
  priceCentsSnapshot: number;
  discountCentsSnapshot?: number;
}

/**
 * The single place appointment totals and advance amounts are computed
 * (DATABASE.md §7: "single PricingService").
 *
 * `subtotalCents` is the sum of **list** prices and `discountCents` what came
 * off them, so the two together tell the whole story on an invoice. Folding
 * the discount into the subtotal would produce the same total while making it
 * impossible to say what the customer saved.
 *
 * The advance is computed on the total *after* discount: asking for 50% of a
 * price nobody is paying would over-collect and then owe a refund.
 */
@Injectable()
export class PricingService {
  computeTotals(lines: PricedLine[], settings: TenantSettings): AppointmentTotals {
    const subtotalCents = lines.reduce((sum, l) => sum + l.priceCentsSnapshot, 0);
    const discountCents = lines.reduce((sum, l) => sum + (l.discountCentsSnapshot ?? 0), 0);
    const totalCents = Math.max(0, subtotalCents - discountCents);

    const rawAdvance = this.computeRawAdvance(totalCents, settings);
    const advanceRequiredCents = Math.max(0, Math.min(rawAdvance, totalCents));
    const balanceCents = totalCents - advanceRequiredCents;

    return { subtotalCents, discountCents, totalCents, advanceRequiredCents, balanceCents };
  }

  private computeRawAdvance(totalCents: number, settings: TenantSettings): number {
    switch (settings.advanceRule) {
      case AdvanceRule.NO_ADVANCE:
        return 0;
      case AdvanceRule.FULL_PAYMENT:
        return totalCents;
      case AdvanceRule.FIXED_AMOUNT:
        return settings.advanceValueCents ?? 0;
      case AdvanceRule.PERCENTAGE:
        return Math.round((totalCents * (settings.advancePercent ?? 0)) / 100);
      default:
        return 0;
    }
  }
}
