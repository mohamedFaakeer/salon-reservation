import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

/** PUT /staff/:id/services — replaces the full assignment set (checkbox-form semantics). */
export class SetStaffServicesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  serviceIds!: string[];
}
