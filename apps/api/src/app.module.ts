import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
// Aliased: this repo's own `./schedule/schedule.module` (staff working
// hours, P8) already exports a class named `ScheduleModule` — unrelated to
// this cron-scheduling module.
import { ScheduleModule as CronScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { TenantModule } from "./tenant/tenant.module";
import { AuthorizationModule } from "./common/authorization/authorization.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";
import { TeamModule } from "./team/team.module";
import { ClosureModule } from "./closure/closure.module";
import { AuditModule } from "./audit/audit.module";
import { ServiceModule } from "./service/service.module";
import { StaffModule } from "./staff/staff.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { StaffLeaveModule } from "./staff-leave/staff-leave.module";
import { AvailabilityModule } from "./availability/availability.module";
import { CustomerModule } from "./customer/customer.module";
import { BookingModule } from "./booking/booking.module";
import { AppointmentModule } from "./appointment/appointment.module";
import { InquiryModule } from "./inquiry/inquiry.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { IncentiveModule } from "./incentive/incentive.module";
import { ReportsModule } from "./reports/reports.module";
import { InvoiceModule } from "./invoice/invoice.module";
import { GiftCardModule } from "./gift-card/gift-card.module";
import { ServicePackageModule } from "./service-package/service-package.module";
import { ProductModule } from "./product/product.module";
import { InventoryModule } from "./inventory/inventory.module";
import { BundleModule } from "./bundle/bundle.module";
import { RetailSaleModule } from "./retail-sale/retail-sale.module";
import { SalonModule } from "./salon/salon.module";
import { PaymentModule } from "./payment/payment.module";
import { NotificationModule } from "./notification/notification.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CustomerAuthModule } from "./customer-auth/customer-auth.module";
import { MonitoringModule } from "./monitoring/monitoring.module";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Workspaces may launch apps from the package dir (cwd=apps/api) or repo
      // root; resolve the root .env from either location.
      envFilePath: [".env", "../../.env"],
    }),
    CronScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url:
          config.get<string>("DATABASE_URL") ??
          "postgresql://salon:salon@localhost:5432/salon",
        autoLoadEntities: true,
        synchronize: false,
        logging: false,
        ssl:
          config.get<string>("NODE_ENV") === "production"
            ? { rejectUnauthorized: false }
            : false,
        // Default pg pool size (10) deadlocks under concurrent bookings:
        // BookingService.reserveAndConfirm holds one connection for its
        // transaction while awaiting AvailabilityService calls that need a
        // second connection from the same pool — with enough simultaneous
        // requests, every held connection ends up waiting on a pool that has
        // nothing left to hand out (found via P17's concurrency soak test).
        extra: { max: 20 },
      }),
    }),
    AuthModule,
    TenantModule,
    // Guard order = module-import order for multiple APP_GUARD providers:
    // JwtAuthGuard (AuthModule) -> TenantGuard (TenantModule) -> RolesGuard.
    AuthorizationModule,
    SuperAdminModule,
    TeamModule,
    ClosureModule,
    AuditModule,
    ServiceModule,
    StaffModule,
    ScheduleModule,
    StaffLeaveModule,
    AvailabilityModule,
    CustomerModule,
    BookingModule,
    AppointmentModule,
    InquiryModule,
    AttendanceModule,
    IncentiveModule,
    ReportsModule,
    InvoiceModule,
    GiftCardModule,
    ServicePackageModule,
    ProductModule,
    InventoryModule,
    BundleModule,
    RetailSaleModule,
    SalonModule,
    PaymentModule,
    NotificationModule,
    DashboardModule,
    CustomerAuthModule,
    MonitoringModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes("*");
  }
}
