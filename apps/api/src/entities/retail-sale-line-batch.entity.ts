import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { RetailSaleLine } from "./retail-sale-line.entity";
import { StockBatch } from "./stock-batch.entity";

/**
 * Which batch(es) a sold line actually drew from, and how many units from
 * each — a line can span more than one row when the FIFO allocator has to
 * spill from one batch into the next. This join is what makes a serial
 * lookup work end-to-end: serial number -> `StockBatch` -> this table ->
 * `RetailSaleLine` -> `RetailSale` header (sale date, and customer if one was
 * attached) for a warranty conversation.
 */
@Entity("retail_sale_line_batch")
export class RetailSaleLineBatch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  saleLineId!: string;

  @ManyToOne(() => RetailSaleLine, { onDelete: "CASCADE" })
  @JoinColumn({ name: "saleLineId" })
  saleLine!: RetailSaleLine;

  @Column({ type: "uuid", nullable: true })
  batchId!: string | null;

  @ManyToOne(() => StockBatch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "batchId" })
  batch!: StockBatch | null;

  @Column({ type: "int" })
  quantity!: number;
}
