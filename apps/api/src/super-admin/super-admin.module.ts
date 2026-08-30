import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../entities/appointment.entity";
import { Branch } from "../entities/branch.entity";
import { Customer } from "../entities/customer.entity";
import { CustomerAccountSalonLink } from "../entities/customer-account-salon-link.entity";
import { Inquiry } from "../entities/inquiry.entity";
import { Staff } from "../entities/staff.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { AuthModule } from "../auth/auth.module";
import { TenantModule } from "../tenant/tenant.module";
import { AuditModule } from "../audit/audit.module";
import { AvailabilityModule } from "../availability/availability.module";
import { BookingModule } from "../booking/booking.module";
import { PlatformAlertModule } from "../alerting/platform-alert.module";
import { TeamModule } from "../team/team.module";
import { SuperAdminController } from "./super-admin.controller";
import { SuperAdminService } from "./super-admin.service";
import { DemoSeedService } from "./demo-seed.service";
import { TenantOffboardingService } from "./tenant-offboarding.service";
import { TenantOffboardingScheduler } from "./tenant-offboarding.scheduler";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Branch,
      User,
      UserTenantRole,
      Appointment,
      Customer,
      Staff,
      Inquiry,
      CustomerAccountSalonLink,
    ]),
    TenantModule,
    AuthModule,
    AuditModule,
    AvailabilityModule,
    BookingModule,
    PlatformAlertModule,
    TeamModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, DemoSeedService, TenantOffboardingService, TenantOffboardingScheduler],
  exports: [DemoSeedService, TenantOffboardingService],
})
export class SuperAdminModule {}
