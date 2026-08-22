import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ProductVariant } from "./product-variant.entity";
import { RetailSale } from "./retail-sale.entity";

/**
 * One sold line. `nameSnapshot`/`skuSnapshot`/`unitPriceCentsSnapshot`/
 * `unitCostCentsSnapshot` are frozen at sale time — the same "never
 * reconstruct history from current data" rule `AppointmentServiceLine`
 * follows, since a product's name, price or cost can all change later.
 * `unitCostCentsSnapshot` is the variant's weighted-average cost at the
 * moment of sale, which is what margin reporting is built on.
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

  @Column({ type: "varchar", length: 160 })
  nameSnapshot!: string;

  @Column({ type: "varchar", length: 64 })
  skuSnapshot!: string;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "int" })
  unitPriceCentsSnapshot!: number;

  @Column({ type: "int" })
  unitCostCentsSnapshot!: number;

  @Column({ type: "int" })
  lineTotalCents!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
