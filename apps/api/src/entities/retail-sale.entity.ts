import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { RetailSaleStatus } from "@salon/shared";
import { Customer } from "./customer.entity";
import { Payment } from "./payment.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * The checkout record — structured like `Appointment`: a header plus
 * immutable snapshot lines (`RetailSaleLine`). `customerId` is never null: a
 * walk-in sale resolves to the tenant's lazily-created walk-in placeholder
 * `Customer` rather than relaxing this FK, so every existing `Payment`
 * consumer keeps its "a payment always has a real customer row" assumption.
 */
@Entity("retail_sale")
@Index(["tenantId", "createdAt"])
export class RetailSale {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Index()
  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  @Column({ type: "uuid", nullable: true })
  paymentId!: string | null;

  @ManyToOne(() => Payment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "paymentId" })
  payment!: Payment | null;

  @Column({ type: "int" })
  subtotalCents!: number;

  @Column({ type: "int" })
  totalCents!: number;

  @Column({ type: "uuid", nullable: true })
  soldById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "soldById" })
  soldBy!: User | null;

  @Column({ type: "varchar", length: 24, default: "COMPLETED" })
  status!: RetailSaleStatus;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
