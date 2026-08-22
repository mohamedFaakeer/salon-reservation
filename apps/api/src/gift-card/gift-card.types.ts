import type { GiftCardStatus } from "@salon/shared";

export interface GiftCardView {
  id: string;
  code: string;
  initialValueCents: number;
  remainingBalanceCents: number;
  currency: string;
  purchaser: { name: string; phone: string } | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  message: string | null;
  expiresAt: string;
  /** Computed live against today's date — never a stored status value (see GiftCardStatus). */
  expired: boolean;
  status: GiftCardStatus;
  issuedByName: string | null;
  issuedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
}
