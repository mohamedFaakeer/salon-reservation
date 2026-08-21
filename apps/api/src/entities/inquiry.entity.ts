import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
// InquiryStatus is a value here (it supplies the column default); BookingSource
// is only ever the column's TypeScript type, since the column itself is varchar.
import { InquiryStatus, type BookingSource } from "@salon/shared";
import { Appointment } from "./appointment.entity";
import { Customer } from "./customer.entity";
import { Service } from "./service.entity";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";

/**
 * Somebody asked a question. Nothing is reserved.
 *
 * This is deliberately NOT an Appointment. `appointment` requires a staff
 * member, a date and a time range, all NOT NULL, and carries the GiST
 * exclusion constraint that CLAUDE.md rule §3 makes the final arbiter against
 * double-booking. An inquiry has none of those three, so storing it there
 * would mean making those columns nullable and weakening that constraint for
 * rows that were never going to occupy a slot in the first place. It would
 * also put timeless rows into the day board, the availability queries, the
 * dashboard counts and the payment ledger.
 *
 * So it lives on its own, and converts into a real Appointment through the
 * ordinary availability engine when the customer decides — rule §1 is intact
 * because an inquiry never books anything itself.
 */
@Entity("inquiry")
@Index(["tenantId", "status", "createdAt"])
@Index(["tenantId", "customerId"])
export class Inquiry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;

  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  /** How they asked. The same channels a booking can arrive through. */
  @Column({ type: "varchar", length: 20 })
  source!: BookingSource;

  @Column({ type: "varchar", length: 20, default: InquiryStatus.OPEN })
  status!: InquiryStatus;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  /**
   * Set when this inquiry turned into a booking. Nullable and ON DELETE SET
   * NULL: the inquiry is the record that the conversation happened, and it
   * must survive the appointment being purged.
   */
  @Column({ type: "uuid", nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => Appointment, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment | null;

  /** Who logged it, for the same reason every audit row names an actor. */
  @Column({ type: "uuid", nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "createdByUserId" })
  createdByUser!: User | null;

  @OneToMany(() => InquiryService, (line) => line.inquiry)
  services!: InquiryService[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

/**
 * A service the customer asked about.
 *
 * The name is snapshotted for the same reason `appointment_service` snapshots
 * it: a service renamed or retired next year must still read as the thing
 * they actually asked about. `serviceId` stays as the link for pre-filling the
 * booking drawer on conversion.
 */
@Entity("inquiry_service")
@Index(["inquiryId"])
export class InquiryService {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  inquiryId!: string;

  @ManyToOne(() => Inquiry, (inquiry) => inquiry.services, { onDelete: "CASCADE" })
  @JoinColumn({ name: "inquiryId" })
  inquiry!: Inquiry;

  @Column({ type: "uuid", nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => Service, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "serviceId" })
  service!: Service | null;

  @Column({ type: "varchar", length: 120 })
  nameSnapshot!: string;
}
