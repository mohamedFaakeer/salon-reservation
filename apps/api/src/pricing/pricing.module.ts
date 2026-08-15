import { Module } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { RefundCalculator } from "./refund-calculator";

@Module({
  providers: [PricingService, RefundCalculator],
  exports: [PricingService, RefundCalculator],
})
export class PricingModule {}
