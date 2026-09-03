import type { PayComponentKind, PayComponentType } from "@salon/shared";

export interface PayComponentView {
  id: string;
  staffId: string;
  staffName: string;
  type: PayComponentType;
  kind: PayComponentKind;
  amountCents: number;
  epfApplicable: boolean;
  etfApplicable: boolean;
  reason: string | null;
  active: boolean;
  createdByName: string;
  createdAt: string;
}
