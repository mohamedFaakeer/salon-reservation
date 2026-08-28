import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { CustomerAccount } from "./customer-account.entity";
import { Tenant } from "./tenant.entity";
import { Customer } from "./customer.entity";

/**
 * Bridges the platform-level `CustomerAccount` to a tenant-scoped `Customer`
 * row (DECISIONS.md). Created the first time a logged-in account books with
 * a given salon, so each salon's own booking history/receipts keep working
 * exactly as they do for a guest booker — nothing about `Customer` changes.
 */
@Entity("customer_account_salon_link")
@Index(["customerAccountId", "tenantId"], { unique: true })
export class CustomerAccountSalonLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  customerAccountId!: string;

  @ManyToOne(() => CustomerAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerAccountId" })
  customerAccount!: CustomerAccount;

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

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
