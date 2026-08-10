import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Branch } from "../entities/branch.entity";
import { RefreshSession } from "../entities/refresh-session.entity";
import { Tenant } from "../entities/tenant.entity";
import { User } from "../entities/user.entity";
import { UserTenantRole } from "../entities/user-tenant-role.entity";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./services/auth.service";
import { PasswordService } from "./services/password.service";
import { SessionService } from "./services/session.service";
import { TokenService } from "./services/token.service";

@Module({
imports: [
  TypeOrmModule.forFeature([User, UserTenantRole, RefreshSession, Tenant, Branch]),
],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}