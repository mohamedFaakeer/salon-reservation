import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditQueryDto } from "@salon/shared";
import type { Request } from "express";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// AuditService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "./audit.service";

/** API.md §3 "Audit" — OWNER, MANAGER (read) only. */
@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions(Permission.VIEW_AUDIT_LOG)
  list(@Req() req: Request, @Query() query: AuditQueryDto) {
    const ctx = getTenantContext(req);
    return this.audit.query(ctx.tenantId, query);
  }
}
