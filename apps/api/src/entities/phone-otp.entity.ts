import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A one-time phone verification code (DECISIONS.md). Only `codeHash` (SHA-256,
 * same policy as `refresh_session.tokenHash`) is ever stored — the raw code
 * exists only in the SMS sent to the customer. `purpose` is a single fixed
 * value today (`SIGNUP_VERIFY`) but is a real column, not a boolean, so a
 * later use (e.g. phone-number change) doesn't need its own table.
 */
@Entity("phone_otp")
@Index(["phone", "purpose"])
export class PhoneOtp {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "varchar", length: 30 })
  purpose!: string;

  @Column({ type: "varchar", length: 64 })
  codeHash!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  /** Capped at MAX_VERIFY_ATTEMPTS in the service — a wrong guess increments this, not a new row. */
  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ type: "timestamptz", nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
