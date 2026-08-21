import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";

/**
 * A customer's rating of one completed appointment.
 *
 * Immutable once given: there is no update path. A rating that can be revised
 * after the salon has seen it is a negotiation, not feedback, and the audit
 * trail would have to record every version to stay honest.
 */
@Entity("rating")
export class Rating {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment;

  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  /** Who did the work. Nullable so a departed stylist does not delete the rating. */
  @Column({ type: "uuid", nullable: true })
  staffId!: string | null;

  @ManyToOne(() => Staff, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "staffId" })
  staff!: Staff | null;

  /** 1-5. The database enforces the range, not just the DTO. */
  @Column({ type: "smallint" })
  score!: number;

  @Column({ type: "varchar", length: 1000, nullable: true })
  comment!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
