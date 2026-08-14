import { Injectable } from "@nestjs/common";
import type {
  PaymentConfirmInput,
  PaymentConfirmResult,
  PaymentProvider,
  PaymentRefundInput,
  PaymentRefundResult,
} from "./payment-provider.interface";

/**
 * MVP default (PRD Decision Q3 — record-only). There is nothing external to
 * call: staff/the customer are recording a payment that already happened
 * (cash handed over, bank transfer received, card captured elsewhere), so
 * both methods resolve immediately with no provider reference. Inputs are
 * accepted (satisfying the `PaymentProvider` interface real callers rely
 * on) but unused.
 */
@Injectable()
export class ManualProvider implements PaymentProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async confirm(_input: PaymentConfirmInput): Promise<PaymentConfirmResult> {
    return { providerPaymentRef: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refund(_input: PaymentRefundInput): Promise<PaymentRefundResult> {
    return { providerRef: null };
  }
}
