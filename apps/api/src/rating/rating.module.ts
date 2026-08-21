import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Rating } from "../entities/rating.entity";
import { RatingService } from "./rating.service";

@Module({
  imports: [TypeOrmModule.forFeature([Rating])],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
