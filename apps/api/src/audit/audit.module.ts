import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuditLog } from "../entities/audit-log.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { PlatformAlertModule } from "../alerting/platform-alert.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  // User/Tenant: AuditService looks up an actor's/tenant's name only when
  // deciding whether a HIGH/CRITICAL security event needs an immediate
  // email — see AuditService.maybeAlert(). PlatformAlertModule is a leaf
  // module with no imports of its own, specifically so this doesn't become
  // a circular dependency with the monitoring feature that also emails
  // through it.
  imports: [TypeOrmModule.forFeature([AuditLog, Tenant, User]), PlatformAlertModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
