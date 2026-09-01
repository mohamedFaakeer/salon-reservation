import type { PaymentMethod, RetailSaleStatus } from "@salon/shared";

export interface RetailSaleLineView {
  id: string;
  variantId: string | null;
  bundleId: string | null;
  nameSnapshot: string;
  /** Null for a bundle line — a bundle has no SKU of its own in Phase B. Also null for a custom line. */
  skuSnapshot: string | null;
  /** Set only on a custom (off-catalog) line — e.g. "30g". */
  attributeSnapshot: string | null;
  quantity: number;
  unitPriceCentsSnapshot: number;
  unitCostCentsSnapshot: number;
  lineTotalCents: number;
  /** How many units of this line have already been returned (any disposition) — what's left to return. */
  returnedQuantity: number;
  /**
   * True for a genuinely off-catalog line (`variantId`/`bundleId` both
   * null) — the UI badges these distinctly from real catalog lines.
   */
  isCustom: boolean;
  /** Set once an OWNER/MANAGER has turned this custom line into a real catalog variant. Always null for a non-custom line. */
  convertedToVariantId: string | null;
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
    attributeSnapshot: string | null;
    quantity: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
}

/** One row in the "needs review" queue — GET /retail-sales/custom-lines/pending. */
export interface PendingCustomLineView {
  id: string;
  saleId: string;
  nameSnapshot: string;
  attributeSnapshot: string | null;
  quantity: number;
  unitPriceCentsSnapshot: number;
  soldByName: string | null;
  customerName: string;
  createdAt: Date;
}
