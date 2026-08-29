import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Staff } from "../entities/staff.entity";
import { StaffServiceAssignment } from "../entities/staff-service.entity";
import { Service } from "../entities/service.entity";
import { User } from "../entities/user.entity";
import { IncentivePlan } from "../entities/incentive-plan.entity";
import { CloudinaryModule } from "../cloudinary/cloudinary.module";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  imports: [TypeOrmModule.forFeature([Staff, StaffServiceAssignment, Service, User, IncentivePlan]), CloudinaryModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
