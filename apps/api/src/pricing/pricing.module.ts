import { Module } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { RefundCalculator } from "./refund-calculator";
import { ServiceDiscountService } from "./service-discount.service";

@Module({
  providers: [PricingService, RefundCalculator, ServiceDiscountService],
  exports: [PricingService, RefundCalculator, ServiceDiscountService],
})
export class PricingModule {}
