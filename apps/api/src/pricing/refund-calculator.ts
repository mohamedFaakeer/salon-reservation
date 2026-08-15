import { Injectable } from "@nestjs/common";
import type { CancellationPolicy } from "@salon/shared";

export interface RefundInput {
  startTime: Date;
  now: Date;
  isSelfService: boolean;
  policy: CancellationPolicy;
  alreadyPaidCents: number;
  isNoShow: boolean;
}

export interface RefundResult {
  refundPercent: number;
  refundCents: number;
}

/** The single place a refund amount is ever computed (DECISIONS.md Q9 / SECURITY.md §12: "single RefundCalculator"). */
@Injectable()
export class RefundCalculator {
  computeRefund(input: RefundInput): RefundResult {
    const refundPercent = this.resolvePercent(input);
    const refundCents = Math.min(
      input.alreadyPaidCents,
      Math.round((input.alreadyPaidCents * refundPercent) / 100),
    );
    return { refundPercent, refundCents };
  }

  private resolvePercent(input: RefundInput): number {
    if (input.isNoShow) {
      return input.policy.noShowRefundPercent;
    }
    const cutoff = new Date(input.startTime.getTime() - input.policy.selfServiceCutoffHours * 60 * 60_000);
    return input.now < cutoff ? input.policy.refundPercentBeforeCutoff : input.policy.refundPercentAfterCutoff;
  }
}
