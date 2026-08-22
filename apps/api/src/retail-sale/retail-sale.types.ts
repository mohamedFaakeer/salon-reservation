import type { RetailSaleStatus } from "@salon/shared";

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
  lines: RetailSaleLineView[];
  createdAt: Date;
}
