import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { RetailSale } from "./retail-sale.entity";
import { Refund } from "./refund.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * One return event against a completed sale — may cover one or several of
 * its lines, each independently RESTOCK or QUARANTINE
 * (`RetailReturnLine.disposition`). `refundId`/`refundedCents` are set only
 * when staff chose to refund money back (`RetailReturnService.process`,
 * via the existing `PaymentService.refundWithManager` — the same path an
 * appointment cancellation refund already uses); an even exchange leaves
 * both null/0.
 */
@Entity("retail_return")
@Index(["tenantId", "saleId"])
export class RetailReturn {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  saleId!: string;

  @ManyToOne(() => RetailSale, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleId" })
  sale!: RetailSale;

  @Column({ type: "uuid", nullable: true })
  processedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "processedById" })
  processedBy!: User | null;

  @Column({ type: "varchar", length: 500 })
  reason!: string;

  @Column({ type: "uuid", nullable: true })
  refundId!: string | null;

  @ManyToOne(() => Refund, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "refundId" })
  refund!: Refund | null;

  @Column({ type: "int", default: 0 })
  refundedCents!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
