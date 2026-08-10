import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Branch } from "../entities/branch.entity";
import { BranchService } from "./branch.service";

/** No controller here — routes live on TenantController (/tenant/me/branch). */
@Module({
  imports: [TypeOrmModule.forFeature([Branch])],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
