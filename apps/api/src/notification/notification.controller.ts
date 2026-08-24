import { Controller, Get, HttpCode, Param, Post, Query, Req, Body, Patch, Delete } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
// DTOs must stay VALUE imports: ValidationPipe resolves them via
// design:paramtypes metadata at runtime; `import type` would erase them.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { 
  NotificationQueryDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  NotificationRuleQueryDto,
  CreateNotificationTemplateDto,
  UpdateNotificationTemplateDto,
  TestNotificationDto,
  NotificationQuotaQueryDto,
  CustomerNotificationPreferencesDto,
} from "@salon/shared";
import { getTenantContext } from "../tenant/tenant-context";
import { Permissions } from "../common/authorization/permissions.decorator";
import { Permission } from "../common/authorization/permission.enum";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationService } from "./notification.service";
import { NotificationEvaluatorService } from "./services/notification-evaluator.service";

/** API.md §3 "Notifications". */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly evaluator: NotificationEvaluatorService,
  ) {}

  // ============ Existing endpoints ============
  @Get()
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  list(@Req() req: Request, @Query() query: NotificationQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.list(ctx.tenantId, query);
  }

  @Post(":id/retry")
  @HttpCode(200)
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  retry(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.retry(ctx.tenantId, id);
  }

  // ============ Notification Rules ============
  @Post("rules")
  @Permissions(Permission.MANAGE_NOTIFICATION_RULES)
  async createRule(@Req() req: Request, @Body() dto: CreateNotificationRuleDto) {
    const ctx = getTenantContext(req);
    return this.notifications.createRule(ctx.tenantId, dto);
  }

  @Get("rules")
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  async listRules(@Req() req: Request, @Query() query: NotificationRuleQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.listRules(ctx.tenantId, query);
  }

  @Get("rules/:id")
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  async getRule(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.getRule(ctx.tenantId, id);
  }

  @Patch("rules/:id")
  @Permissions(Permission.MANAGE_NOTIFICATION_RULES)
  async updateRule(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateNotificationRuleDto) {
    const ctx = getTenantContext(req);
    return this.notifications.updateRule(ctx.tenantId, id, dto);
  }

  @Delete("rules/:id")
  @HttpCode(204)
  @Permissions(Permission.MANAGE_NOTIFICATION_RULES)
  async deleteRule(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.deleteRule(ctx.tenantId, id);
  }

  // ============ Notification Templates ============
  @Post("templates")
  @Permissions(Permission.MANAGE_NOTIFICATION_TEMPLATES)
  async createTemplate(@Req() req: Request, @Body() dto: CreateNotificationTemplateDto) {
    const ctx = getTenantContext(req);
    return this.notifications.createTemplate(ctx.tenantId, dto);
  }

  @Get("templates")
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  async listTemplates(@Req() req: Request, @Query() query: NotificationRuleQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.listTemplates(ctx.tenantId, query);
  }

  @Get("templates/:id")
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  async getTemplate(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.getTemplate(ctx.tenantId, id);
  }

  @Patch("templates/:id")
  @Permissions(Permission.MANAGE_NOTIFICATION_TEMPLATES)
  async updateTemplate(@Req() req: Request, @Param("id") id: string, @Body() dto: UpdateNotificationTemplateDto) {
    const ctx = getTenantContext(req);
    return this.notifications.updateTemplate(ctx.tenantId, id, dto);
  }

  @Delete("templates/:id")
  @HttpCode(204)
  @Permissions(Permission.MANAGE_NOTIFICATION_TEMPLATES)
  async deleteTemplate(@Req() req: Request, @Param("id") id: string) {
    const ctx = getTenantContext(req);
    return this.notifications.deleteTemplate(ctx.tenantId, id);
  }

  // ============ Test Notification ============
  @Post("test")
  @Permissions(Permission.MANAGE_NOTIFICATION_RULES)
  async testNotification(@Req() req: Request, @Body() dto: TestNotificationDto) {
    const ctx = getTenantContext(req);
    return this.evaluator.evaluateAndSendTest(ctx.tenantId, dto);
  }

  // ============ Quota ============
  @Get("quota")
  @Permissions(Permission.VIEW_NOTIFICATIONS)
  async getQuota(@Req() req: Request, @Query() query: NotificationQuotaQueryDto) {
    const ctx = getTenantContext(req);
    return this.notifications.getQuota(ctx.tenantId, query.channel);
  }

  // ============ Customer Preferences ============
  @Get("customers/:customerId/preferences")
  @Permissions(Permission.VIEW_CUSTOMERS)
  async getCustomerPreferences(@Req() req: Request, @Param("customerId") customerId: string) {
    const ctx = getTenantContext(req);
    return this.notifications.getCustomerPreferences(ctx.tenantId, customerId);
  }

  @Patch("customers/:customerId/preferences")
  @Permissions(Permission.MANAGE_CUSTOMERS)
  async updateCustomerPreferences(
    @Req() req: Request,
    @Param("customerId") customerId: string,
    @Body() dto: CustomerNotificationPreferencesDto,
  ) {
    const ctx = getTenantContext(req);
    return this.notifications.updateCustomerPreferences(ctx.tenantId, customerId, dto);
  }
}
