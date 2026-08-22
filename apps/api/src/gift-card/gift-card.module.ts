import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GiftCard } from "../entities/gift-card.entity";
import { Payment } from "../entities/payment.entity";
import { CustomerModule } from "../customer/customer.module";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { GiftCardController } from "./gift-card.controller";
import { GiftCardService } from "./gift-card.service";

@Module({
  imports: [TypeOrmModule.forFeature([GiftCard, Payment]), CustomerModule, AuditModule, TenantModule],
  controllers: [GiftCardController],
  providers: [GiftCardService],
  exports: [GiftCardService],
})
export class GiftCardModule {}
