import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, type CreateTagDto, type UpdateTagDto } from "@salon/shared";
import { Tag } from "../entities/tag.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";

/**
 * A tenant's tag definitions ("VIP", "Colour client") — the list the
 * customer tag multi-select reads from and can add to. Listing is open to
 * anyone with `MANAGE_CUSTOMERS` (so the multi-select can populate for a
 * RECEPTIONIST too); create/rename/delete require the narrower
 * `MANAGE_CUSTOMER_TAGS` (OWNER/MANAGER only) — enforced in the controller.
 *
 * A real hard delete on a tag is fine: it's a definition/config object, not
 * a business record under CLAUDE.md's no-hard-delete rule — deleting one
 * cascades to `CustomerTag`, same reasoning as deleting a service category.
 */
@Injectable()
export class TagService {
  constructor(@InjectRepository(Tag) private readonly tags: Repository<Tag>) {}

  async list(tenantId: string): Promise<Tag[]> {
    return this.tags.find({ where: { tenantId }, order: { label: "ASC" } });
  }

  async create(tenantId: string, dto: CreateTagDto): Promise<Tag> {
    try {
      return await this.tags.save(
        this.tags.create({ tenantId, label: dto.label.trim(), color: dto.color?.trim() || null }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_TAG",
          message: "That tag already exists.",
        });
      }
      throw err;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.findOwned(tenantId, id);
    if (dto.label !== undefined) tag.label = dto.label.trim();
    if (dto.color !== undefined) tag.color = dto.color?.trim() || null;
    try {
      return await this.tags.save(tag);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_TAG",
          message: "That tag already exists.",
        });
      }
      throw err;
    }
  }

  /** Cascades to every `CustomerTag` row for this tag (FK ON DELETE CASCADE) — no separate cleanup needed. */
  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOwned(tenantId, id);
    await this.tags.delete({ id, tenantId });
  }

  private async findOwned(tenantId: string, id: string): Promise<Tag> {
    const tag = await this.tags.findOne({ where: { id, tenantId } });
    if (!tag) {
      throw new ApiError({ statusCode: 404, code: "TAG_NOT_FOUND", message: "Tag not found." });
    }
    return tag;
  }
}
