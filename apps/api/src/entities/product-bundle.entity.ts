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
 * A kit sold as one line ("Gift Set" = shampoo + conditioner). Deliberately
 * has no `quantityOnHand` of its own — `ProductBundleComponent` is the only
 * source of truth for what it contains, and availability is always computed
 * live from each component's current stock (`BundleService.availabilityOf`),
 * never stored, so a bundle can never desync from what it's actually made of.
 */
@Entity("product_bundle")
@Index(["tenantId", "active"])
export class ProductBundle {
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

  @Column({ type: "int" })
  priceCents!: number;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
