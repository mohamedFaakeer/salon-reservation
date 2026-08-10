import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Closure } from "../entities/closure.entity";
import { ClosureController } from "./closure.controller";
import { ClosureService } from "./closure.service";

@Module({
  imports: [TypeOrmModule.forFeature([Closure])],
  controllers: [ClosureController],
  providers: [ClosureService],
  exports: [ClosureService],
})
export class ClosureModule {}
