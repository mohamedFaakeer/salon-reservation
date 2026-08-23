import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { StockBatch } from "../entities/stock-batch.entity";
import { StockMovement } from "../entities/stock-movement.entity";
import { AuditModule } from "../audit/audit.module";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ProductController } from "./product.controller";
import { ProductVariantController } from "./product-variant.controller";
import { ProductService } from "./product.service";
import { ProductImportService } from "./product-import.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant, StockBatch, StockMovement]),
    AuditModule,
    CloudinaryModule,
    InventoryModule,
  ],
  controllers: [ProductController, ProductVariantController],
  providers: [ProductService, ProductImportService],
  exports: [ProductService],
})
export class ProductModule {}
