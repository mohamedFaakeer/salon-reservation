import type { RetailSaleStatus } from "@salon/shared";

export interface RetailSaleLineView {
  id: string;
  variantId: string | null;
  nameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPriceCentsSnapshot: number;
  unitCostCentsSnapshot: number;
  lineTotalCents: number;
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
