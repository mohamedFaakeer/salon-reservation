import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import type { RetailReturnDisposition } from "@salon/shared";
import { RetailReturn } from "./retail-return.entity";
import { RetailSaleLine } from "./retail-sale-line.entity";

/**
 * One returned line. `quantity` is checked against the original line's own
 * quantity, less whatever has already been returned against it, by
 * `RetailReturnService` — never enforced by the database, since that sum
 * spans multiple rows across possibly multiple `RetailReturn`s.
 */
@Entity("retail_return_line")
@Index(["saleLineId"])
@Check("CHK_retail_return_line_qty_positive", `"quantity" > 0`)
export class RetailReturnLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  returnId!: string;

  @ManyToOne(() => RetailReturn, { onDelete: "CASCADE" })
  @JoinColumn({ name: "returnId" })
  return!: RetailReturn;

  @Column({ type: "uuid" })
  saleLineId!: string;

  @ManyToOne(() => RetailSaleLine, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleLineId" })
  saleLine!: RetailSaleLine;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "varchar", length: 20 })
  disposition!: RetailReturnDisposition;
}
