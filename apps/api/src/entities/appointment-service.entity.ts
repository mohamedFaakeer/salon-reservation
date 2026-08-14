import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Appointment } from "./appointment.entity";
import { Service } from "./service.entity";
import { User } from "./user.entity";

/**
 * Named `AppointmentServiceLine`, not `AppointmentService`, to avoid
 * colliding with the injectable `AppointmentService` — same precedent as
 * P7's `StaffServiceAssignment`. `@Entity("appointment_service")` still maps
 * to the documented table name (DATABASE.md §2.4).
 *
 * Snapshot fields (`nameSnapshot`/`durationMinSnapshot`/`priceCentsSnapshot`)
 * are the immutable history (CLAUDE.md rule 5) — never re-derived from the
 * current `Service` row, which may have since changed price/duration/name.
 */
@Entity("appointment_service")
export class AppointmentServiceLine {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "appointmentId" })
  appointment!: Appointment;

  @Column({ type: "uuid", nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => Service, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "serviceId" })
  service!: Service | null;

  @Column({ type: "varchar", length: 120 })
  nameSnapshot!: string;

  @Column({ type: "int" })
  durationMinSnapshot!: number;

  @Column({ type: "int" })
  priceCentsSnapshot!: number;

  @Column({ type: "varchar", length: 10, default: "ACTIVE" })
  status!: "ACTIVE" | "REMOVED";

  @Column({ type: "uuid", nullable: true })
  removedById!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "removedById" })
  removedBy!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  removedAt!: Date | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  removedReason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
