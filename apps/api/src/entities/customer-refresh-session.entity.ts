import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { CustomerAccount } from "./customer-account.entity";

/**
 * The customer-account equivalent of `RefreshSession` — same opaque-token,
 * hash-only, rotate-with-reuse-detection design (SECURITY.md §2), scoped to
 * `CustomerAccount` instead of the staff `User` table. Kept as its own table
 * rather than reusing `refresh_session` because a customer account carries no
 * tenant/role — merging the two would mean every read of that table needs to
 * branch on which kind of session it found.
 */
@Entity("customer_refresh_session")
export class CustomerRefreshSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  customerAccountId!: string;

  @ManyToOne(() => CustomerAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerAccountId" })
  customerAccount!: CustomerAccount;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  replacedBySessionId!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
