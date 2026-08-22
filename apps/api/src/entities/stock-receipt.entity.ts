import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * A stock-in event header — one or more `StockBatch` rows hang off it.
 * `supplierName` is deliberately free text, not a `Supplier` entity: CLAUDE.md
 * keeps "purchases" (a PO approval chain) out of scope, so receiving stock is
 * a simple manual action, not a procurement workflow.
 */
@Entity("stock_receipt")
@Index(["tenantId", "receivedAt"])
export class StockReceipt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 160, nullable: true })
  supplierName!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  referenceNote!: string | null;

  @Column({ type: "uuid", nullable: true })
  receivedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "receivedById" })
  receivedBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  receivedAt!: Date;

  /** Denormalized sum of `quantity * unitCostCents` across this receipt's batches. */
  @Column({ type: "int", default: 0 })
  totalCostCents!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
