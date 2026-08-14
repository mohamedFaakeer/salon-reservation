/** ARCHITECTURE.md §5 — record-only MVP default plus a never-invoked live-gateway stub. */
export interface PaymentConfirmInput {
  amountCents: number;
  idempotencyKey: string;
}

export interface PaymentConfirmResult {
  providerPaymentRef: string | null;
}

export interface PaymentRefundInput {
  amountCents: number;
  providerPaymentRef: string | null;
}

export interface PaymentRefundResult {
  providerRef: string | null;
}

export interface PaymentProvider {
  confirm(input: PaymentConfirmInput): Promise<PaymentConfirmResult>;
  refund(input: PaymentRefundInput): Promise<PaymentRefundResult>;
}
