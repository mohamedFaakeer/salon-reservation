import { Injectable } from "@nestjs/common";
import { AdvanceRule, type TenantSettings } from "@salon/shared";
import type { BookingSnapshotLine } from "../entities/slot-hold.entity";

export interface AppointmentTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  advanceRequiredCents: number;
  balanceCents: number;
}

/**
 * The single place appointment totals and advance amounts are computed
 * (DATABASE.md §7: "single PricingService"). No discount mechanism exists
 * yet, so `discountCents` is always 0 — unchanged from before this phase.
 */
@Injectable()
export class PricingService {
  computeTotals(lines: BookingSnapshotLine[], settings: TenantSettings): AppointmentTotals {
    const subtotalCents = lines.reduce((sum, l) => sum + l.priceCentsSnapshot, 0);
    const discountCents = 0;
    const totalCents = subtotalCents - discountCents;

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
