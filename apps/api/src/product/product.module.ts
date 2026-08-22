import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Product } from "../entities/product.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { AuditModule } from "../audit/audit.module";
import { ProductController } from "./product.controller";
import { ProductVariantController } from "./product-variant.controller";
import { ProductService } from "./product.service";

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductVariant]), AuditModule],
  controllers: [ProductController, ProductVariantController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
