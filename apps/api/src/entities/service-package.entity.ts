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
import type { ServicePackageStatus } from "@salon/shared";
import { Customer } from "./customer.entity";
import { Payment } from "./payment.entity";
import { Service } from "./service.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * A bundle of prepaid uses of one specific service, sold once and drawn
 * down one use per visit until it's gone. Sibling to `GiftCard`, not an
 * extension of it — the balance here is `remainingUses`, not a cents
 * balance, and it's scoped to exactly one `serviceId` (v1: single-service
 * packages only). `remainingUses` is drawn down by
 * `ServicePackageService.redeemOne` (never edited directly elsewhere);
 * `status` flips to DEPLETED automatically once it hits zero. Void mirrors
 * `GiftCard`'s pattern exactly.
 */
@Entity("service_package")
@Index(["tenantId", "status"])
@Check("CHK_service_package_uses_range", `"remainingUses" >= 0 AND "remainingUses" <= "totalUses"`)
@Check(
  "CHK_service_package_void_has_reason",
  `("status" <> 'VOID') OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL)`,
)
export class ServicePackage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  /** `<3-letter tenant prefix>-PKG-<10 random base32 chars>`, e.g. `ELE-PKG-7F3K2M9PQR`. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 24 })
  code!: string;

  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  /**
   * The one service this package redeems against. RESTRICT, not
   * SET NULL/CASCADE — an active, spendable balance with no resolvable
   * service is meaningless, so deleting a service with active packages
   * against it must be blocked rather than silently orphaning them.
   */
  @Column({ type: "uuid" })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "serviceId" })
  service!: Service;

  /** Frozen at purchase so the UI still reads correctly if the service is later renamed. */
  @Column({ type: "varchar", length: 120 })
  serviceNameSnapshot!: string;

  /** The value credited per redeemed use — frozen at purchase, same immutability rule `AppointmentServiceLine` follows for price snapshots. */
  @Column({ type: "int" })
  unitPriceCentsSnapshot!: number;

  @Column({ type: "int" })
  totalUses!: number;

  @Column({ type: "int" })
  remainingUses!: number;

  /** What was actually paid for the whole package — may be less than `totalUses` × `unitPriceCentsSnapshot`; that gap is the discount. */
  @Column({ type: "int" })
  purchasePriceCents!: number;

  @Column({ type: "date" })
  expiresAt!: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: ServicePackageStatus;

  @Column({ type: "uuid", nullable: true })
  issuedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "issuedById" })
  issuedBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  issuedAt!: Date;

  /** The payment recorded for buying the package itself — not a redemption. */
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
