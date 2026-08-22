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
import type { StockBatchStatus } from "@salon/shared";
import { ProductVariant } from "./product-variant.entity";
import { StockReceipt } from "./stock-receipt.entity";
import { Tenant } from "./tenant.entity";

/**
 * One physical lot or one serialised unit. `quantityReceived` is immutable
 * once written; `quantityRemaining` is drawn down by sales and grown back by
 * a Phase B restock-return, always inside `[0, quantityReceived]`. Batch
 * *selection* for a sale is FIFO by `expiresAt` (nulls-last), then by receipt
 * date — separate from costing, which always snapshots the variant's current
 * weighted-average cost regardless of which batch the units came from.
 *
 * Lock ordering when a sale touches both rows: the variant lock always comes
 * first, then the batch lock — the same deadlock-avoidance reasoning this
 * codebase already applies to slot-hold locking.
 */
@Entity("stock_batch")
@Index(["tenantId", "variantId", "status", "expiresAt"])
@Index(["tenantId", "serialNumber"], { unique: true, where: '"serialNumber" IS NOT NULL' })
@Check("CHK_stock_batch_qty_range", `"quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityReceived"`)
export class StockBatch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Index()
  @Column({ type: "uuid" })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variantId" })
  variant!: ProductVariant;

  @Column({ type: "uuid", nullable: true })
  receiptId!: string | null;

  @ManyToOne(() => StockReceipt, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "receiptId" })
  receipt!: StockReceipt | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  lotCode!: string | null;

  /** `YYYY-MM-DD`. Set only when the parent product's `tracksExpiry` is true. */
  @Column({ type: "date", nullable: true })
  expiresAt!: string | null;

  /** Set only when the parent product's `trackSerial` is true — what a warranty lookup queries. */
  @Column({ type: "varchar", length: 120, nullable: true })
  serialNumber!: string | null;

  @Column({ type: "int" })
  unitCostCents!: number;

  @Column({ type: "int" })
  quantityReceived!: number;

  @Column({ type: "int" })
  quantityRemaining!: number;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: StockBatchStatus;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
