import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { Staff } from "../entities/staff.entity";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserTenantRole, Staff]), AuthModule, AuditModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
