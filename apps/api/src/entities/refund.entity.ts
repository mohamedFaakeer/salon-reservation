import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { RefundStatus } from "@salon/shared";
import { Payment } from "./payment.entity";
import { User } from "./user.entity";

/**
 * Manual, record-only refund row (P13 — DATABASE.md §2.5). The
 * cancellation-policy-driven calculation of *how much* to refund is P14's
 * job (`RefundCalculator`); this table just persists what staff recorded.
 */
@Entity("refund")
export class Refund {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  paymentId!: string;

  @ManyToOne(() => Payment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paymentId" })
  payment!: Payment;

  @Column({ type: "int" })
  amountCents!: number;

  @Column({ type: "varchar", length: 500 })
  reason!: string;

  @Column({ type: "varchar", length: 20, default: RefundStatus.PENDING })
  state!: RefundStatus;

  @Column({ type: "varchar", length: 255, nullable: true })
  providerRef!: string | null;

  @Column({ type: "uuid", nullable: true })
  initiatedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "initiatedById" })
  initiatedBy!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
