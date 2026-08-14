import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment } from "../entities/payment.entity";
import { PaymentAttempt } from "../entities/payment-attempt.entity";
import { Refund } from "../entities/refund.entity";
import { Appointment } from "../entities/appointment.entity";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { PaymentController } from "./payment.controller";
import { PaymentService } from "./payment.service";
import { ManualProvider } from "./providers/manual.provider";
import { PayHereProvider } from "./providers/payhere.provider";
import { PaymentProviderResolver } from "./providers/resolve-payment-provider";

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentAttempt, Refund, Appointment]), AuditModule, TenantModule],
  controllers: [PaymentController],
  providers: [PaymentService, ManualProvider, PayHereProvider, PaymentProviderResolver],
  exports: [PaymentService],
})
export class PaymentModule {}
