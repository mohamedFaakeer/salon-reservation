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
  CustomerNotificationPreferences,
  IncentivePayout,
  IncentivePlan,
  IncentivePlanServiceRate,
  Inquiry,
  InquiryService,
  Invoice,
  Notification,
  NotificationLog,
  NotificationQuota,
  NotificationRule,
  NotificationTemplate,
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
  Tag,
  CustomerTag,
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
    CustomerNotificationPreferences,
    IncentivePayout,
    IncentivePlan,
    IncentivePlanServiceRate,
    Inquiry,
    InquiryService,
    Invoice,
    Notification,
    NotificationLog,
    NotificationQuota,
    NotificationRule,
    NotificationTemplate,
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
    Tag,
    CustomerTag,
    Tenant,
    User,
    UserTenantRole,
    WorkingSchedule,
  ],
  migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],
  synchronize: false,
  logging: false,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Pool size kept aligned with app.module.ts — see the comment there.
  // statement_timeout/query_timeout are deliberately NOT mirrored here: those
  // protect a live request from a hung query, but a real migration can
  // legitimately run longer than that on a big table, and killing it
  // mid-alter is worse than a slow migration. connectionTimeoutMillis is
  // safe to share — failing fast because the DB is unreachable is never
  // wrong, for a migration run or a live request.
  extra: { max: 20, connectionTimeoutMillis: 10_000 },
});