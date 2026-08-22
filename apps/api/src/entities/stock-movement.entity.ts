import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { StockMovementType } from "@salon/shared";
import { ProductVariant } from "./product-variant.entity";
import { StockBatch } from "./stock-batch.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * Append-only ledger — never edited or deleted, a stricter version of
 * CLAUDE.md's "no hard deletes on business records". `quantityAfter` is a
 * snapshot of `variant.quantityOnHand` immediately after this row was
 * written, which makes the ledger independently reconstructible even if a
 * later bug ever desyncs the denormalized running total. `referenceType`/
 * `referenceId` loosely point at whichever table caused this movement
 * (`RetailSale`, `StockReceipt`, or nothing for a manual adjustment).
 */
@Entity("stock_movement")
@Index(["tenantId", "variantId", "createdAt"])
export class StockMovement {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variantId" })
  variant!: ProductVariant;

  @Column({ type: "uuid", nullable: true })
  batchId!: string | null;

  @ManyToOne(() => StockBatch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "batchId" })
  batch!: StockBatch | null;

  @Column({ type: "varchar", length: 20 })
  type!: StockMovementType;

  /** Signed: positive grows stock (receipt, restock, found-stock adjustment), negative shrinks it (sale, write-off, shrinkage adjustment). */
  @Column({ type: "int" })
  quantityDelta!: number;

  @Column({ type: "int" })
  quantityAfter!: number;

  @Column({ type: "varchar", length: 40, nullable: true })
  referenceType!: string | null;

  @Column({ type: "uuid", nullable: true })
  referenceId!: string | null;

  /** Required at the service layer for ADJUSTMENT/WRITE_OFF; null for the ordinary RECEIPT/SALE path. */
  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: "uuid", nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "actorUserId" })
  actorUser!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
