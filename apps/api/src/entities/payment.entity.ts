import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PaymentProviderName, PaymentStatus, type PaymentMethod, type PaymentType } from "@salon/shared";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * One row per recorded advance/full/balance payment (DATABASE.md §2.5).
 * `appointmentId` is SET NULL, never CASCADE — a payment's audit trail must
 * outlive the appointment it was recorded against (CLAUDE.md: no hard
 * deletes on business records). `idempotencyKey` is the sole guarantee
 * against duplicate recording on a retried request.
 */
@Entity("payment")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Index()
  @Column({ type: "uuid", nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => Appointment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment | null;

  @Index()
  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  @Column({ type: "int" })
  amountCents!: number;

  @Column({ type: "varchar", length: 20 })
  method!: PaymentMethod;

  @Column({ type: "varchar", length: 24, default: PaymentStatus.PENDING })
  state!: PaymentStatus;

  @Column({ type: "varchar", length: 10 })
  type!: PaymentType;

  @Index({ unique: true })
  @Column({ type: "uuid" })
  idempotencyKey!: string;

  @Column({ type: "varchar", length: 10, default: PaymentProviderName.MANUAL })
  provider!: PaymentProviderName;

  @Column({ type: "varchar", length: 255, nullable: true })
  providerPaymentRef!: string | null;

  /** Null for customer-initiated online payments; set for staff-recorded ones. */
  @Column({ type: "uuid", nullable: true })
  recordedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "recordedById" })
  recordedBy!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  recordedAt!: Date | null;

  /** Set only when `method` is GIFT_CARD — which card's balance this payment drew from. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  giftCardId!: string | null;

  /** Set only when `method` is PACKAGE_CREDIT — which package's uses this payment drew from. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  packageRedemptionId!: string | null;

  /** Set only for a retail checkout — which sale this payment was recorded against. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  retailSaleId!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
