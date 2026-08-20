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

@Entity("branch")
export class Branch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  address!: string | null;

  /**
   * Kept separate from `address` because the customer-facing cards and the
   * home search need a city on its own, and no reliable city token can be
   * parsed back out of a free-text address line.
   */
  @Column({ type: "varchar", length: 80, nullable: true })
  city!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  phone!: string | null;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}