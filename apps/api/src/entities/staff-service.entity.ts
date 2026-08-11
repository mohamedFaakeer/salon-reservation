import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Service } from "./service.entity";
import { Staff } from "./staff.entity";
import { Tenant } from "./tenant.entity";

/**
 * Maps to the "staff_service" table (DATABASE.md §2.2). Named
 * StaffServiceAssignment, not StaffService, to avoid colliding with the
 * StaffService NestJS injectable (the staff resource's business-logic
 * service, following this codebase's <Resource>Service naming convention).
 */
@Entity("staff_service")
export class StaffServiceAssignment {
  @PrimaryColumn({ type: "uuid" })
  staffId!: string;

  @PrimaryColumn({ type: "uuid" })
  serviceId!: string;

  @Index()
  @Column({ type: "uuid" })
  tenantId!: string;

  @ManyToOne(() => Staff, { onDelete: "CASCADE" })
  @JoinColumn({ name: "staffId" })
  staff!: Staff;

  @ManyToOne(() => Service, { onDelete: "CASCADE" })
  @JoinColumn({ name: "serviceId" })
  service!: Service;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenantId" })
  tenant!: Tenant;
}
