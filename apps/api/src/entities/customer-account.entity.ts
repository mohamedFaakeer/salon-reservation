import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * A platform-level identity — deliberately not tenant-scoped (DECISIONS.md):
 * one account works across every salon, unlike the tenant-scoped `Customer`
 * row that still holds each salon's own booking history for this person.
 * `CustomerAccountSalonLink` is what connects the two.
 */
@Entity("customer_account")
export class CustomerAccount {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  firstName!: string;

  @Column({ type: "varchar", length: 120 })
  lastName!: string;

  /** Normalized via `normalizeSriLankanPhone` before it ever reaches this column. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  /** Null until the phone's first successful OTP check; never reset by a later login. */
  @Column({ type: "timestamptz", nullable: true })
  phoneVerifiedAt!: Date | null;

  @Column({ type: "timestamptz" })
  termsAcceptedAt!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
