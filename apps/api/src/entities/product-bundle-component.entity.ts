import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ProductBundle } from "./product-bundle.entity";
import { ProductVariant } from "./product-variant.entity";

/**
 * One ingredient of a bundle. `variantId` is CASCADE (unlike every other
 * variant reference in this module, which is SET NULL) — a bundle's own
 * definition is meaningless once one of its components stops existing, so
 * deleting... except variants are never hard-deleted either (CLAUDE.md), so
 * in practice this only ever fires if a variant row itself is ever removed
 * outside the normal soft-disable path.
 */
@Entity("product_bundle_component")
@Index(["bundleId", "variantId"], { unique: true })
@Check("CHK_product_bundle_component_qty_positive", `"quantityPerBundle" > 0`)
export class ProductBundleComponent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  bundleId!: string;

  @ManyToOne(() => ProductBundle, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bundleId" })
  bundle!: ProductBundle;

  @Index()
  @Column({ type: "uuid" })
  variantId!: string;

  @ManyToOne(() => ProductVariant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "variantId" })
  variant!: ProductVariant;

  @Column({ type: "int" })
  quantityPerBundle!: number;
}
