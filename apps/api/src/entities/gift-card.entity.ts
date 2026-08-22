import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { GiftCardStatus } from "@salon/shared";
import { Customer } from "./customer.entity";
import { Payment } from "./payment.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * Stored value a salon sold, redeemable across one or more visits until the
 * balance runs out. `remainingBalanceCents` is drawn down by
 * `GiftCardService.redeem` (never edited directly elsewhere); `status` flips
 * to REDEEMED automatically once it hits zero. Void mirrors
 * `IncentivePayout`'s pattern exactly — the same `CHECK` shape, the same
 * "already-void is the only blocked transition, a partially-spent card can
 * still be voided as a correction" posture.
 */
@Entity("gift_card")
@Index(["tenantId", "status"])
@Check("CHK_gift_card_balance_range", `"remainingBalanceCents" >= 0 AND "remainingBalanceCents" <= "initialValueCents"`)
@Check(
  "CHK_gift_card_void_has_reason",
  `("status" <> 'VOID') OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)`,
)
export class GiftCard {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  /** `<3-letter tenant prefix>-GC-<10 random base32 chars>`, e.g. `ELE-GC-7F3K2M9PQR`. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 24 })
  code!: string;

  @Column({ type: "int" })
  initialValueCents!: number;

  @Column({ type: "int" })
  remainingBalanceCents!: number;

  @Column({ type: "varchar", length: 3, default: "LKR" })
  currency!: string;

  @Column({ type: "uuid" })
  purchaserCustomerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "purchaserCustomerId" })
  purchaserCustomer!: Customer;

  @Column({ type: "varchar", length: 120, nullable: true })
  recipientName!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  recipientPhone!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  recipientEmail!: string | null;

  /** The personal note, up to 120 characters — shown to the recipient, not a receipt line. */
  @Column({ type: "varchar", length: 120, nullable: true })
  message!: string | null;

  @Column({ type: "date" })
  expiresAt!: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: GiftCardStatus;

  @Column({ type: "uuid", nullable: true })
  issuedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "issuedById" })
  issuedBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  issuedAt!: Date;

  /** The payment recorded for buying the card itself — not a redemption. */
  @Column({ type: "uuid", nullable: true })
  purchasePaymentId!: string | null;

  @ManyToOne(() => Payment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "purchasePaymentId" })
  purchasePayment!: Payment | null;

  @Column({ type: "timestamptz", nullable: true })
  voidedAt!: Date | null;

  @Column({ type: "uuid", nullable: true })
  voidedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "voidedBy" })
  voidedByUser!: User | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  voidReason!: string | null;
}
