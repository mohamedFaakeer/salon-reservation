import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";
import { Tenant } from "./tenant.entity";

export enum InvoiceStatus {
  ISSUED = "ISSUED",
  /** Replaced by a later version. Kept, never deleted. */
  SUPERSEDED = "SUPERSEDED",
}

/**
 * What the customer was actually billed, frozen at the moment of issue.
 *
 * A document, not a view. Once an invoice has been emailed it exists outside
 * this system, and a record that silently disagrees with the copy in
 * somebody's inbox is worse than no record. So a later correction — a refund,
 * a discount put right — issues a *new* invoice that points back at this one,
 * and both are kept. That is CLAUDE.md rule §5 applied to a document rather
 * than a row.
 *
 * The money columns are duplicated out of `snapshot` on purpose: they are what
 * a report or a search would want to filter on, and reaching into jsonb for
 * "unpaid invoices this month" would be the wrong shape of query.
 */
@Entity("invoice")
@Index(["tenantId", "issuedAt"])
@Index(["appointmentId"])
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment;

  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  /** Human-facing and unique within the salon, e.g. `EAGL-2026-0001`. */
  @Column({ type: "varchar", length: 40 })
  number!: string;

  /** 1 for the original; each correction increments it. */
  @Column({ type: "int", default: 1 })
  version!: number;

  /**
   * The invoice this one replaces. Null on an original.
   * SET NULL rather than CASCADE so deleting an old version could never take
   * the correction with it.
   */
  @Column({ type: "uuid", nullable: true })
  supersedesInvoiceId!: string | null;

  @ManyToOne(() => Invoice, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "supersedesInvoiceId" })
  supersedes!: Invoice | null;

  @Column({ type: "varchar", length: 20, default: InvoiceStatus.ISSUED })
  status!: InvoiceStatus;

  @Column({ type: "int" })
  subtotalCents!: number;

  /** The salon's published offers. */
  @Column({ type: "int", default: 0 })
  serviceDiscountCents!: number;

  /** What the desk took off. */
  @Column({ type: "int", default: 0 })
  billDiscountCents!: number;

  @Column({ type: "int" })
  totalCents!: number;

  /** Money received against this appointment when the invoice was cut. */
  @Column({ type: "int", default: 0 })
  paidCents!: number;

  @Column({ type: "int" })
  balanceCents!: number;

  @Column({ type: "varchar", length: 3, default: "LKR" })
  currency!: string;

  /**
   * The whole document, frozen: both parties, every line with its list price
   * and what came off it, the desk discount and its reason, and the payments
   * received.
   *
   * jsonb rather than child tables, against this schema's usual habit, and for
   * the reason the feature exists: nothing may drift. Nothing queries an
   * individual invoice line, and a relational copy would invite exactly the
   * later edit this document must not permit. `tenant.settings` sets the
   * precedent.
   */
  @Column({ type: "jsonb" })
  snapshot!: InvoiceSnapshot;

  /** Null until it actually reached somebody. */
  @Column({ type: "timestamptz", nullable: true })
  lastSentAt!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  lastSentTo!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  issuedAt!: Date;
}

export interface InvoiceSnapshotLine {
  name: string;
  durationMin: number;
  listPriceCents: number;
  discountCents: number;
  discountLabel: string | null;
  chargedCents: number;
}

export interface InvoiceSnapshot {
  salon: {
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    /** Optional; printed only when the salon has filled it in. */
    businessRegNo: string | null;
    /** Frozen at issue time, same as everything else here — a later logo change never rewrites an already-sent invoice. */
    logoUrl: string | null;
  };
  customer: {
    name: string;
    phone: string;
    email: string | null;
  };
  appointment: {
    bookingReference: string;
    startTime: string;
    staffName: string;
  };
  lines: InvoiceSnapshotLine[];
  billDiscount: {
    type: string;
    value: number;
    cents: number;
    reason: string | null;
  } | null;
  payments: Array<{
    method: string;
    amountCents: number;
    recordedAt: string | null;
    /** Cash-only (APT-10) — set together, only when tendered exceeded the balance. */
    tenderedCents: number | null;
    changeCents: number | null;
  }>;
}
