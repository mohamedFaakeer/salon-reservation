import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PaymentAttemptStatus, type PaymentProviderName } from "@salon/shared";
import { Payment } from "./payment.entity";

/**
 * Provider callback/event log (DATABASE.md §2.5). The unique
 * `(provider, providerEventId)` index absorbs duplicate webhook deliveries —
 * not exercised by the synchronous `ManualProvider` this phase, but the
 * constraint exists for the (never-invoked) `PayHereProvider` stub.
 */
@Entity("payment_attempt")
export class PaymentAttempt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  paymentId!: string;

  @ManyToOne(() => Payment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "paymentId" })
  payment!: Payment;

  @Column({ type: "varchar", length: 10 })
  provider!: PaymentProviderName;

  @Column({ type: "varchar", length: 60, nullable: true })
  providerEventHandler!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  providerEventId!: string | null;

  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 20, default: PaymentAttemptStatus.RECEIVED })
  status!: PaymentAttemptStatus;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
