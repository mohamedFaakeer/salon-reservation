import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Branch } from "../entities/branch.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { AuthModule } from "../auth/auth.module";
import { TenantModule } from "../tenant/tenant.module";
import { AuditModule } from "../audit/audit.module";
import { SuperAdminController } from "./super-admin.controller";
import { SuperAdminService } from "./super-admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Branch, User, UserTenantRole]),
    TenantModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
