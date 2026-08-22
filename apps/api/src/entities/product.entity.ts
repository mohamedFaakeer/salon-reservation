import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";

/**
 * The sellable concept a salon stocks ("Sunsilk Shampoo"), not a specific SKU
 * — `ProductVariant` is the actual unit sold and tracked. `tracksExpiry` and
 * `trackSerial` are per-product flags a stock receipt validates against: a
 * cosmetic needs an expiry date on every batch, a durable resold good (a
 * dryer, a straightener) needs a serial instead. `active` is a soft-disable,
 * matching `Staff`'s pattern — a discontinued product's sales history must
 * outlive it (CLAUDE.md: no hard deletes on business records).
 */
@Entity("product")
@Index(["tenantId", "active"])
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  /** Free text, no taxonomy — mirrors Service.category. */
  @Column({ type: "varchar", length: 80, nullable: true })
  category!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  brand!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "boolean", default: false })
  tracksExpiry!: boolean;

  @Column({ type: "boolean", default: false })
  trackSerial!: boolean;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
