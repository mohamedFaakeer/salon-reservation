import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity("refresh_session")
export class RefreshSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: User;

  /** SHA-256 hash of the opaque refresh token — the raw token is never stored. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt!: Date | null;

  /**
   * Set when this session is rotated: SHA-256 hash of the session that replaced
   * it (the same opaque-hash-only policy as tokenHash).
   */
  @Column({ type: "varchar", length: 64, nullable: true })
  replacedBySessionId!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}