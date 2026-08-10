import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type BranchUpdateDto } from "@salon/shared";
import { Branch } from "../entities/branch.entity";

/** MVP is single-branch-per-tenant (DATABASE.md) — no multi-branch CRUD. */
@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
  ) {}

  async getDefaultBranch(tenantId: string): Promise<Branch> {
    const branch = await this.branches.findOne({ where: { tenantId } });
    if (!branch) {
      throw new ApiError({
        statusCode: 404,
        code: "BRANCH_NOT_FOUND",
        message: "No branch found for this salon.",
      });
    }
    return branch;
  }

  async updateDefaultBranch(
    tenantId: string,
    patch: BranchUpdateDto,
  ): Promise<Branch> {
    const branch = await this.getDefaultBranch(tenantId);
    if (patch.name !== undefined) branch.name = patch.name;
    if (patch.address !== undefined) branch.address = patch.address;
    if (patch.phone !== undefined) branch.phone = patch.phone;
    return this.branches.save(branch);
  }
}
