import type { RetailReturnDisposition } from "@salon/shared";

export interface RetailReturnLineView {
  id: string;
  saleLineId: string;
  quantity: number;
  disposition: RetailReturnDisposition;
}

export interface RetailReturnView {
  id: string;
  saleId: string;
  processedByName: string | null;
  reason: string;
  refundedCents: number;
  lines: RetailReturnLineView[];
  createdAt: Date;
}
