import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockMovement } from "../entities/stock-movement.entity";
import { StockReceipt } from "../entities/stock-receipt.entity";
import { AuditModule } from "../audit/audit.module";
import { InventoryController } from "./inventory.controller";
import { StockMutationService } from "./stock-mutation.service";
import { StockReceiptService } from "./stock-receipt.service";
import { InventoryAdjustmentService } from "./inventory-adjustment.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, StockBatch, StockMovement, StockReceipt]),
    AuditModule,
  ],
  controllers: [InventoryController],
  providers: [StockMutationService, StockReceiptService, InventoryAdjustmentService],
  exports: [StockMutationService],
})
export class InventoryModule {}
