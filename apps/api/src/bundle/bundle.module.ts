import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductBundle } from "../entities/product-bundle.entity";
import { ProductBundleComponent } from "../entities/product-bundle-component.entity";
import { ProductVariant } from "../entities/product-variant.entity";
import { AuditModule } from "../audit/audit.module";
import { BundleController } from "./bundle.controller";
import { BundleService } from "./bundle.service";

@Module({
  imports: [TypeOrmModule.forFeature([ProductBundle, ProductBundleComponent, ProductVariant]), AuditModule],
  controllers: [BundleController],
  providers: [BundleService],
  exports: [BundleService],
})
export class BundleModule {}
