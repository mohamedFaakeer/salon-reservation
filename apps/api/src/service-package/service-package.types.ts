import type { ServicePackageStatus } from "@salon/shared";

export interface ServicePackageView {
  id: string;
  code: string;
  customer: { name: string; phone: string } | null;
  serviceId: string;
  serviceNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  totalUses: number;
  remainingUses: number;
  purchasePriceCents: number;
  expiresAt: string;
  /** Computed live against today's date — never a stored status value (see ServicePackageStatus). */
  expired: boolean;
  status: ServicePackageStatus;
  issuedByName: string | null;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}
