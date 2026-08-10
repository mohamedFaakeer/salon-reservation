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

/** Salon-wide closure (e.g. "Poya day"). No soft-delete column — see DECISIONS.md. */
@Entity("closure")
export class Closure {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "date" })
  startDate!: string;

  @Column({ type: "date" })
  endDate!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
