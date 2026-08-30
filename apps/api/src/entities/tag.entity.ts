import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tenant } from "./tenant.entity";

/**
 * A tenant's own label for grouping/filtering customers ("VIP", "Colour
 * client"). A configuration/definition object, not a business record under
 * CLAUDE.md's no-hard-delete rule (docs/DATABASE.md) — deleting a tag is a
 * real hard delete, cascading to `CustomerTag`, same reasoning as deleting a
 * service category would be. Managed only by OWNER/MANAGER
 * (Permission.MANAGE_CUSTOMER_TAGS); anyone with MANAGE_CUSTOMERS can apply
 * an existing one to a customer.
 */
@Entity("tag")
@Index(["tenantId", "label"], { unique: true })
export class Tag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 40 })
  label!: string;

  /** Hex color, e.g. "#0d9488". Null falls back to a neutral chip in the UI. */
  @Column({ type: "varchar", length: 7, nullable: true })
  color!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
