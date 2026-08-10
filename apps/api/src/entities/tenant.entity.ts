import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TenantSettings } from "@salon/shared";
import type { TenantStatus } from "../enums/tenant-status.enum";

@Entity("tenant")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 63 })
  slug!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 20, default: "ACTIVE" })
  status!: TenantStatus;

  @Column({ type: "varchar", length: 3, default: "LKR" })
  currency!: string;

  @Column({ type: "varchar", length: 63, default: "Asia/Colombo" })
  timezone!: string;

  @Column({ type: "jsonb", default: () => "'{}'" })
  settings!: TenantSettings;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}