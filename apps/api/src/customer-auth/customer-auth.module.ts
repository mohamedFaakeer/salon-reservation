import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CustomerAccount } from "../entities/customer-account.entity";
import { CustomerRefreshSession } from "../entities/customer-refresh-session.entity";
import { PhoneOtp } from "../entities/phone-otp.entity";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationModule } from "../notification/notification.module";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAuthService } from "./services/customer-auth.service";
import { CustomerSessionService } from "./services/customer-session.service";
import { CustomerTokenService } from "./services/customer-token.service";
import { CustomerOtpService } from "./services/customer-otp.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerAccount, CustomerRefreshSession, PhoneOtp]),
    AuthModule, // for PasswordService — the exact same argon2id hashing staff accounts use
    NotificationModule, // for SmsNotificationProvider — OTP rides the same Text.lk connection
    AuditModule, // CustomerAuthService/CustomerSessionService audit failed logins and refresh-token reuse
  ],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerSessionService, CustomerTokenService, CustomerOtpService],
  exports: [CustomerTokenService],
})
export class CustomerAuthModule {}
