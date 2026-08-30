import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateTagDto, UpdateTagDto } from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// TagService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TagService } from "./tag.service";

/**
 * Customer tag definitions. Listing is `MANAGE_CUSTOMERS` (anyone who can
 * work with customers can see the tag list to apply one); create/rename/
 * delete are the narrower `MANAGE_CUSTOMER_TAGS` (OWNER/MANAGER only),
 * overriding the class-level default per method — same shape as
 * `TeamController`'s `RESET_TEAM_MEMBER_PASSWORD` split.
 */
@ApiTags("tags")
@ApiBearerAuth()
@Controller("tags")
@Permissions(Permission.MANAGE_CUSTOMERS)
export class TagController {
  constructor(private readonly tags: TagService) {}

  @Get()
  list(@Req() req: Request) {
    const ctx = getTenantContext(req);
    return this.tags.list(ctx.tenantId);
  }

  @Post()
  @Permissions(Permission.MANAGE_CUSTOMER_TAGS)
  create(@Req() req: Request, @Body() dto: CreateTagDto) {
    const ctx = getTenantContext(req);
    return this.tags.create(ctx.tenantId, dto);
  }

  @Patch(":id")
  @Permissions(Permission.MANAGE_CUSTOMER_TAGS)
  update(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateTagDto) {
    const ctx = getTenantContext(req);
    return this.tags.update(ctx.tenantId, id, dto);
  }

  @Delete(":id")
  @Permissions(Permission.MANAGE_CUSTOMER_TAGS)
  remove(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.tags.remove(ctx.tenantId, id);
  }
}
