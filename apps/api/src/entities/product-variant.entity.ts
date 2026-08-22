import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Product } from "./product.entity";
import { Tenant } from "./tenant.entity";

/**
 * The actual SKU sold ("...400ml, Green"). `tenantId` is denormalized here
 * (not just reachable via `product`) so every mutation can scope and lock
 * this row directly, the same shape `Staff.branchId` and every other
 * frequently-filtered column in this codebase uses.
 *
 * `quantityOnHand` and `weightedAvgCostCents` are running totals kept in sync
 * transactionally by `StockMutationService`/`StockReceiptService` — never
 * edited directly elsewhere, the same "denormalized field kept in sync"
 * pattern `Appointment.balanceCents` already uses. Every mutation of
 * `quantityOnHand` takes a `pessimistic_write` lock on this row first — this
 * is the module's core guarantee against two receptionists selling the same
 * last unit.
 */
@Entity("product_variant")
@Index(["tenantId", "sku"], { unique: true })
@Index(["tenantId", "barcode"], { unique: true, where: '"barcode" IS NOT NULL' })
@Check("CHK_product_variant_qty_nonneg", `"quantityOnHand" >= 0`)
export class ProductVariant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Index()
  @Column({ type: "uuid" })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product!: Product;

  @Column({ type: "varchar", length: 64 })
  sku!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  barcode!: string | null;

  /** Free-form, e.g. `{"color":"Green","size":"400ml"}` — no schema validation, same restraint as Service.category. */
  @Column({ type: "jsonb", default: () => "'{}'" })
  attributes!: Record<string, string>;

  /** Optional — falls back to the parent product's image when unset. Same real-HTTPS-URL rule as `Product.imageUrl`. */
  @Column({ type: "varchar", length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: "int" })
  priceCents!: number;

  @Column({ type: "int", default: 0 })
  weightedAvgCostCents!: number;

  @Column({ type: "int", default: 0 })
  quantityOnHand!: number;

  @Column({ type: "int", nullable: true })
  reorderPoint!: number | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
