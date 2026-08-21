import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { DEFAULT_TENANT_SETTINGS, type TenantSettings } from "@salon/shared";
import type { TenantStatus } from "../enums/tenant-status.enum";

/**
 * `tenant.settings` is a jsonb blob with no migration ever backfilling it, so
 * a tenant provisioned before a settings field existed has a stored blob that
 * simply lacks that key — not `null`, absent. Read as plain JS, an absent
 * numeric field is `undefined`, and `undefined` participates in arithmetic
 * and comparisons in ways that fail *silently*: `someShare > undefined` is
 * always `false`, so `discountCapPercent`'s authorization check never
 * triggered for any tenant older than the phase that added it, and
 * `someMinutes - undefined` is `NaN`, which Postgres then refuses outright
 * the next time it is written to an integer column.
 *
 * Merging the shipped defaults under whatever is actually stored, on every
 * read, closes that gap at its one true source rather than trusting every
 * future call site to remember `?? DEFAULT`. `cancellationPolicy` gets the
 * same treatment one level down for the same reason.
 */
export function withDefaults(raw: Partial<TenantSettings> | null | undefined): TenantSettings {
  return {
    ...DEFAULT_TENANT_SETTINGS,
    ...raw,
    cancellationPolicy: {
      ...DEFAULT_TENANT_SETTINGS.cancellationPolicy,
      ...raw?.cancellationPolicy,
    },
  };
}

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

  @Column({
    type: "jsonb",
    default: () => "'{}'",
    transformer: { to: (value: TenantSettings) => value, from: withDefaults },
  })
  settings!: TenantSettings;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}