import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserTenantRole]), AuthModule, AuditModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
