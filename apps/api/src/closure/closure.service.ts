import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type CreateClosureDto } from "@salon/shared";
import { Closure } from "../entities/closure.entity";

@Injectable()
export class ClosureService {
  constructor(
    @InjectRepository(Closure) private readonly closures: Repository<Closure>,
  ) {}

  async create(tenantId: string, dto: CreateClosureDto): Promise<Closure> {
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_DATE_RANGE",
        message: "endDate must be on or after startDate.",
      });
    }
    return this.closures.save(
      this.closures.create({
        tenantId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        name: dto.name.trim(),
      }),
    );
  }

  async list(tenantId: string): Promise<Closure[]> {
    return this.closures.find({
      where: { tenantId },
      order: { startDate: "ASC" },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const closure = await this.closures.findOne({ where: { id, tenantId } });
    if (!closure) {
      throw new ApiError({
        statusCode: 404,
        code: "CLOSURE_NOT_FOUND",
        message: "Closure not found.",
      });
    }
    await this.closures.remove(closure);
  }
}
