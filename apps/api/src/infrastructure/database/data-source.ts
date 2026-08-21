import "reflect-metadata";
import path from "node:path";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import {
  Appointment,
  AppointmentServiceLine,
  AttendanceDay,
  AttendanceEditRequest,
  AuditLog,
  Branch,
  Closure,
  Customer,
  Inquiry,
  InquiryService,
  Invoice,
  Notification,
  Payment,
  PaymentAttempt,
  Rating,
  Refund,
  RefreshSession,
  Service,
  ServiceDiscount,
  ServiceDiscountWindow,
  SlotHold,
  Staff,
  StaffLeave,
  StaffServiceAssignment,
  Tenant,
  User,
  UserTenantRole,
  WorkingSchedule,
} from "../../entities";

// Load workspace-local .env first, then fall back to the repo-root .env.
// (npm workspace scripts run with cwd = the workspace directory.)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const isProduction = process.env.NODE_ENV === "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL ?? "postgresql://salon:salon@localhost:5432/salon",
  entities: [
    Appointment,
    AppointmentServiceLine,
    AttendanceDay,
    AttendanceEditRequest,
    AuditLog,
    Branch,
    Closure,
    Customer,
    Inquiry,
    InquiryService,
    Invoice,
    Notification,
    Payment,
    PaymentAttempt,
    Rating,
    Refund,
    RefreshSession,
    Service,
    ServiceDiscount,
    ServiceDiscountWindow,
    SlotHold,
    Staff,
    StaffLeave,
    StaffServiceAssignment,
    Tenant,
    User,
    UserTenantRole,
    WorkingSchedule,
  ],
  migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],
  synchronize: false,
  logging: false,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Kept aligned with app.module.ts's runtime pool size — see the comment there.
  extra: { max: 20 },
});