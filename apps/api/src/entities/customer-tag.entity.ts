import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Customer } from "./customer.entity";
import { Tag } from "./tag.entity";

/**
 * Customer<->Tag join. Both FKs cascade-delete — removing a customer or a
 * tag definition removes the association, never the other side. Hard
 * deletes are fine here: this row carries no business history, only "this
 * label currently applies", per Tag's own no-hard-delete-rule exemption.
 */
@Entity("customer_tag")
@Index(["customerId", "tagId"], { unique: true })
export class CustomerTag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customerId" })
  customer!: Customer;

  @Index()
  @Column({ type: "uuid" })
  tagId!: string;

  @ManyToOne(() => Tag, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tagId" })
  tag!: Tag;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
