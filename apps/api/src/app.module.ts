import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { TenantModule } from "./tenant/tenant.module";
import { AuthorizationModule } from "./common/authorization/authorization.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";
import { ClosureModule } from "./closure/closure.module";
import { AuditModule } from "./audit/audit.module";
import { ServiceModule } from "./service/service.module";
import { StaffModule } from "./staff/staff.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { StaffLeaveModule } from "./staff-leave/staff-leave.module";
import { AvailabilityModule } from "./availability/availability.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Workspaces may launch apps from the package dir (cwd=apps/api) or repo
      // root; resolve the root .env from either location.
      envFilePath: [".env", "../../.env"],
    }),
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
      }),
    }),
    AuthModule,
    TenantModule,
    // Guard order = module-import order for multiple APP_GUARD providers:
    // JwtAuthGuard (AuthModule) -> TenantGuard (TenantModule) -> RolesGuard.
    AuthorizationModule,
    SuperAdminModule,
    ClosureModule,
    AuditModule,
    ServiceModule,
    StaffModule,
    ScheduleModule,
    StaffLeaveModule,
    AvailabilityModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
