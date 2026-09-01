import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProductBundle } from "./product-bundle.entity";
import { ProductVariant } from "./product-variant.entity";
import { RetailSale } from "./retail-sale.entity";

/**
 * One sold line. `nameSnapshot`/`skuSnapshot`/`unitPriceCentsSnapshot`/
 * `unitCostCentsSnapshot` are frozen at sale time — the same "never
 * reconstruct history from current data" rule `AppointmentServiceLine`
 * follows, since a product's name, price or cost can all change later.
 * `unitCostCentsSnapshot` is the variant's weighted-average cost at the
 * moment of sale, which is what margin reporting is built on.
 *
 * Exactly one of `variantId`/`bundleId` is set — or neither, for a genuinely
 * off-catalog "custom item" (name + attribute + price typed in at sale time,
 * no stock impact; the same convention Square/Shopify/Vend use for selling
 * something not yet in the catalog). A bundle line is a single aggregate row
 * (its own price, and cost summed across every component at sale time)
 * rather than one row per ingredient — Product sales & margin reports it as
 * one "Gift Set"-shaped line, not a shampoo line and a conditioner line; the
 * per-component stock depletion underneath is exact regardless
 * (`RetailSaleLineBatch` still points at real component batches).
 *
 * A custom line's `unitCostCentsSnapshot` is `0` — genuinely unknown, not a
 * real cost — so margin/COGS reporting must filter these out rather than
 * treat it as a real number (`variantId IS NOT NULL OR bundleId IS NOT
 * NULL`). `convertedToVariantId` is set once an OWNER/MANAGER turns a sold
 * custom line into a real catalog `ProductVariant`
 * (`POST /retail-sales/custom-lines/:lineId/convert-to-product`) — a line
 * still "needs review" exactly when `variantId`, `bundleId` AND
 * `convertedToVariantId` are all null.
 */
@Entity("retail_sale_line")
@Check("CHK_retail_sale_line_qty_positive", `"quantity" > 0`)
export class RetailSaleLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  saleId!: string;

  @ManyToOne(() => RetailSale, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleId" })
  sale!: RetailSale;

  @Column({ type: "uuid", nullable: true })
  variantId!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "variantId" })
  variant!: ProductVariant | null;

  @Column({ type: "uuid", nullable: true })
  bundleId!: string | null;

  @ManyToOne(() => ProductBundle, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "bundleId" })
  bundle!: ProductBundle | null;

  @Column({ type: "varchar", length: 160 })
  nameSnapshot!: string;

  /** Null for a bundle line — a bundle has no SKU of its own in Phase B. Also null for a custom line — nothing to give a SKU to yet. */
  @Column({ type: "varchar", length: 64, nullable: true })
  skuSnapshot!: string | null;

  /** The cashier-typed attribute on a custom line (e.g. "30g"). Null for variant/bundle lines. */
  @Column({ type: "varchar", length: 80, nullable: true })
  attributeSnapshot!: string | null;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "int" })
  unitPriceCentsSnapshot!: number;

  @Column({ type: "int" })
  unitCostCentsSnapshot!: number;

  @Column({ type: "int" })
  lineTotalCents!: number;

  /** Set once this custom line has been turned into a real catalog variant — see the class doc comment. */
  @Column({ type: "uuid", nullable: true })
  convertedToVariantId!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "convertedToVariantId" })
  convertedToVariant!: ProductVariant | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
