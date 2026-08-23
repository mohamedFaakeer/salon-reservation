import type { PaymentMethod, RetailSaleStatus } from "@salon/shared";

export interface RetailSaleLineView {
  id: string;
  variantId: string | null;
  bundleId: string | null;
  nameSnapshot: string;
  /** Null for a bundle line — a bundle has no SKU of its own in Phase B. */
  skuSnapshot: string | null;
  quantity: number;
  unitPriceCentsSnapshot: number;
  unitCostCentsSnapshot: number;
  lineTotalCents: number;
  /** How many units of this line have already been returned (any disposition) — what's left to return. */
  returnedQuantity: number;
}

export interface RetailSaleView {
  id: string;
  customer: { id: string; name: string; phone: string; isWalkIn: boolean };
  subtotalCents: number;
  totalCents: number;
  status: RetailSaleStatus;
  soldByName: string | null;
  paymentId: string | null;
  paymentMethod: PaymentMethod | null;
  lines: RetailSaleLineView[];
  createdAt: Date;
}

/**
 * What `GET /retail-sale-receipts/:id` shows a customer with no login — the
 * sale's own id doubles as the unguessable access token, same as every other
 * "no auth, unguessable id in the URL" page this app already serves. Trimmed
 * to receipt-appropriate facts only: no `returnedQuantity`, no cost/margin
 * data, nothing that isn't already printed on the paper receipt.
 */
export interface RetailSaleReceiptView {
  id: string;
  createdAt: Date;
  salon: { name: string; address: string | null; city: string | null; phone: string | null };
  customer: { name: string; phone: string; isWalkIn: boolean };
  soldByName: string | null;
  paymentMethod: PaymentMethod | null;
  lines: Array<{
    id: string;
    bundleId: string | null;
    nameSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
}
