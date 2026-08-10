import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { APP_GUARD } from "@nestjs/core";
import { Tenant } from "../entities/tenant.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { BranchModule } from "../branch/branch.module";
import { TenantService } from "./tenant.service";
import { TenantController } from "./tenant.controller";
import { TenantGuard } from "./tenant.guard";

const globalGuard: Provider = {
  provide: APP_GUARD,
  useClass: TenantGuard,
};

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, UserTenantRole]), BranchModule],
  controllers: [TenantController],
  providers: [TenantService, TenantGuard, globalGuard],
  exports: [TenantService],
})
export class TenantModule {}