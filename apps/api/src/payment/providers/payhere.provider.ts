import { Injectable } from "@nestjs/common";
import { ApiError } from "@salon/shared";
import type {
  PaymentConfirmInput,
  PaymentConfirmResult,
  PaymentProvider,
  PaymentRefundInput,
  PaymentRefundResult,
} from "./payment-provider.interface";

/**
 * Stub adapter shape only (PRD §3.5 / §5: real gateway integration is out of
 * MVP scope). `PAYMENTS_PAYHERE_ENABLED` is never set in this MVP — nothing
 * in the codebase ever resolves this provider for a real request. Exists so
 * the `PaymentProvider` abstraction has a second, feature-flagged
 * implementation as PRD §3.5 documents; every method throws regardless of
 * the flag, since no real HMAC/webhook implementation exists behind it yet.
 */
@Injectable()
export class PayHereProvider implements PaymentProvider {
  readonly enabled = process.env.PAYMENTS_PAYHERE_ENABLED === "true";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async confirm(_input: PaymentConfirmInput): Promise<PaymentConfirmResult> {
    throw new ApiError({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
      message: "PayHere is not enabled for this environment.",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async refund(_input: PaymentRefundInput): Promise<PaymentRefundResult> {
    throw new ApiError({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
      message: "PayHere is not enabled for this environment.",
    });
  }
}
