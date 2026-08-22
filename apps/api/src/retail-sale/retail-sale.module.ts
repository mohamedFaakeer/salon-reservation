import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment } from "../entities/payment.entity";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { RetailSale } from "../entities/retail-sale.entity";
import { RetailSaleLine } from "../entities/retail-sale-line.entity";
import { RetailSaleLineBatch } from "../entities/retail-sale-line-batch.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { CustomerModule } from "../customer/customer.module";
import { AuditModule } from "../audit/audit.module";
import { TenantModule } from "../tenant/tenant.module";
import { InventoryModule } from "../inventory/inventory.module";
import { RetailSaleController } from "./retail-sale.controller";
import { RetailSaleService } from "./retail-sale.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Product, ProductVariant, RetailSale, RetailSaleLine, RetailSaleLineBatch, StockBatch]),
    CustomerModule,
    AuditModule,
    TenantModule,
    InventoryModule,
  ],
  controllers: [RetailSaleController],
  providers: [RetailSaleService],
  exports: [RetailSaleService],
})
export class RetailSaleModule {}
