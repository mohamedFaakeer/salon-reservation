import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { NotificationRule } from "../../entities/notification-rule.entity";
import { NotificationTemplate } from "../../entities/notification-template.entity";
import { Appointment } from "../../entities/appointment.entity";
import { Customer } from "../../entities/customer.entity";
import { Tenant } from "../../entities/tenant.entity";
import { TemplateRendererService } from "./template-renderer.service";
import { NotificationChannel, NotificationEvent } from "@salon/shared";
import type { TestNotificationDto } from "@salon/shared";

/**
 * Context object for rule evaluation.
 */
export interface EvaluationContext {
  tenant: Tenant;
  appointment: Appointment;
  customer: Customer;
  eventType: NotificationEvent;
  now: Date;
}

/**
 * Result of rule evaluation.
 */
export interface EvaluationResult {
  shouldSend: boolean;
  rule: NotificationRule;
  matchedChannels: NotificationChannel[];
  matchedTemplate?: NotificationTemplate;
  renderedSubject: string | null;
  renderedBody: string;
}

/**
 * Service that evaluates notification rules against events and decides what to send.
 * This is the core "brain" of the new notification system.
 */
@Injectable()
export class NotificationEvaluatorService {
  private readonly logger = new Logger(NotificationEvaluatorService.name);

  constructor(
    @InjectRepository(NotificationRule)
    private readonly ruleRepo: Repository<NotificationRule>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    private readonly templateRenderer: TemplateRendererService,
  ) {}

  /**
   * Evaluate all enabled rules for a tenant against an event context.
   * Returns a list of evaluation results (one per matching rule).
   */
  async evaluate(context: EvaluationContext): Promise<EvaluationResult[]> {
    const rules = await this.getEnabledRulesForTenant(context.tenant.id);
    const results: EvaluationResult[] = [];

    for (const rule of rules) {
      // Check if rule matches the event type
      if (!this.ruleMatchesEventType(rule, context.eventType)) {
        continue;
      }

      // Check timing condition
      if (!this.checkTiming(rule, context)) {
        continue;
      }

      // Check targeting criteria
      if (!this.checkTargeting(rule, context)) {
        continue;
      }

      // Check customer preferences
      if (!this.checkCustomerPreferences(rule, context)) {
        continue;
      }

      // Resolve template
      const template = await this.resolveTemplate(rule, context);
      if (!template) {
        this.logger.warn(`No template found for rule ${rule.id}, skipping`);
        continue;
      }

      // Render template for each channel
      const channelResults = await this.renderForChannels(rule, template, context);
      if (channelResults.length === 0) {
        continue;
      }

      // Use the first channel's rendering as the primary result
      const primary = channelResults[0];
      results.push({
        shouldSend: true,
        rule,
        matchedChannels: channelResults.map((c) => c.channel),
        matchedTemplate: template,
        renderedSubject: primary.subject,
        renderedBody: primary.body,
      });
    }

    // Sort by priority (highest first)
    results.sort((a, b) => b.rule.priority - a.rule.priority);

    return results;
  }

  /**
   * Get all enabled rules for a tenant, ordered by priority.
   */
  private async getEnabledRulesForTenant(tenantId: string): Promise<NotificationRule[]> {
    return this.ruleRepo.find({
      where: { tenantId, isEnabled: true },
      order: { priority: "DESC" },
    });
  }

  /**
   * Check if rule's timing type matches the event type.
   * Maps event types to timing categories.
   */
  private ruleMatchesEventType(rule: NotificationRule, eventType: NotificationEvent): boolean {
    const timingType = rule.timingType;
    
    switch (timingType) {
      case "BEFORE_APPT":
        return [NotificationEvent.REMINDER_24H, NotificationEvent.REMINDER_2H].includes(eventType);
      case "DAY_OF_APPT":
        return [
          NotificationEvent.BOOKING_CONFIRMATION,
          NotificationEvent.RESCHEDULE_CONFIRMATION,
          NotificationEvent.LATE_ARRIVAL,
          NotificationEvent.NO_SHOW,
        ].includes(eventType);
      case "AFTER_BOOKING":
        return [NotificationEvent.BOOKING_CONFIRMATION].includes(eventType);
      case "AFTER_COMPLETION":
        return [
          NotificationEvent.PAYMENT_CONFIRMATION,
          NotificationEvent.CANCELLATION_CONFIRMATION,
          NotificationEvent.NO_SHOW,
        ].includes(eventType);
      default:
        return false;
    }
  }

  /**
   * Check if the timing condition matches the current context.
   * For BEFORE_APPT rules, checks if we're within the configured window.
   */
  private checkTiming(rule: NotificationRule, context: EvaluationContext): boolean {
    const timingType = rule.timingType;
    const timingValue = rule.timingValue as Record<string, unknown>;
    const appointmentTime = context.appointment.startTime.getTime();
    const now = context.now.getTime();

    switch (timingType) {
      case "BEFORE_APPT": {
        // timingValue: { offsetHours: number, windowMinutes?: number }
        const offsetHours = Number(timingValue.offsetHours) || 0;
        const windowMinutes = Number(timingValue.windowMinutes) || 20;
        const targetTime = appointmentTime - offsetHours * 60 * 60 * 1000;
        const windowStart = targetTime - windowMinutes * 60 * 1000;
        const windowEnd = targetTime + windowMinutes * 60 * 1000;
        return now >= windowStart && now <= windowEnd;
      }
      
      case "DAY_OF_APPT": {
        // timingValue: { atBooking?: boolean, atCheckin?: boolean }
        // For DAY_OF_APPT, we typically fire at the event moment
        return true;
      }
      
      case "AFTER_BOOKING": {
        // timingValue: { delayMinutes?: number }
        const delayMinutes = Number(timingValue.delayMinutes) || 0;
        const bookingTime = context.appointment.createdAt.getTime();
        return now >= bookingTime + delayMinutes * 60 * 1000;
      }
      
      case "AFTER_COMPLETION": {
        // timingValue: { delayMinutes?: number }
        const delayMinutes = Number(timingValue.delayMinutes) || 0;
        const completionTime = context.appointment.updatedAt.getTime();
        return now >= completionTime + delayMinutes * 60 * 1000;
      }
      
      default:
        return false;
    }
  }

  /**
   * Check if targeting criteria match the appointment/customer.
   * targeting JSON structure:
   * {
   *   staffIds?: string[],
   *   serviceIds?: string[],
   *   customerTags?: string[],
   *   minTotalAmount?: number, (in cents)
   *   maxTotalAmount?: number, (in cents)
   *   bookingSources?: BookingSource[],
   *   isNewCustomer?: boolean,
   *   custom?: Record<string, unknown>
   * }
   */
  private checkTargeting(rule: NotificationRule, context: EvaluationContext): boolean {
    const targeting = rule.targeting as Record<string, unknown>;
    if (!targeting || Object.keys(targeting).length === 0) {
      return true; // No targeting = match all
    }

    const appointment = context.appointment;

    // Staff filter
    if (targeting.staffIds) {
      const staffIds = targeting.staffIds as string[];
      if (staffIds.length > 0 && !staffIds.includes(appointment.staffId)) {
        return false;
      }
    }

    // Service filter - would need appointment-service relation
    if (targeting.serviceIds) {
      const serviceIds = targeting.serviceIds as string[];
      if (serviceIds.length > 0) {
        // TODO: Implement when appointment-service relation exists
        // For now, skip this filter
      }
    }

    // Customer tags filter - customers don't have tags yet
    if (targeting.customerTags) {
      // TODO: Implement when customer tags exist
    }

    // Amount filters (in cents)
    if (targeting.minTotalAmount !== undefined) {
      const minAmount = Number(targeting.minTotalAmount);
      if (appointment.totalCents < minAmount) return false;
    }
    if (targeting.maxTotalAmount !== undefined) {
      const maxAmount = Number(targeting.maxTotalAmount);
      if (appointment.totalCents > maxAmount) return false;
    }

    // Booking source filter
    if (targeting.bookingSources) {
      const sources = targeting.bookingSources as string[];
      if (sources.length > 0 && !sources.includes(appointment.source)) {
        return false;
      }
    }

    // New customer filter
    if (targeting.isNewCustomer !== undefined) {
      const isNew = Boolean(targeting.isNewCustomer);
      const customerAppointmentCount = 0; // TODO: get actual count
      if (isNew && customerAppointmentCount > 0) return false;
      if (!isNew && customerAppointmentCount === 0) return false;
    }

    // Custom filters - extensible for future use
    if (targeting.custom) {
      // Custom logic can be added here
    }

    return true;
  }

  /**
   * Check if customer preferences allow this notification.
   * This is a simplified check - the actual preference checking
   * happens in the notification service when sending.
   */
  private checkCustomerPreferences(_rule: NotificationRule, context: EvaluationContext): boolean {
    // Check if customer has opted out of marketing communications
    // (transactional notifications like booking/payment/reminder are not affected)
    if (context.customer.marketingOptOut === true) {
      // Only block WINBACK_OFFER which is marketing
      // For other events, allow through
      return context.eventType === NotificationEvent.WINBACK_OFFER ? false : true;
    }

    // Check channel-specific preferences
    // This would be expanded with the CustomerNotificationPreferences entity
    return true;
  }

  /**
   * Resolve the template to use for this rule.
   * Priority: rule's inline template > linked template > system default
   */
  private async resolveTemplate(
    rule: NotificationRule,
    context: EvaluationContext,
  ): Promise<NotificationTemplate | null> {
    // If rule has inline template, create a virtual template
    if (rule.templateBody) {
      return {
        id: `inline-${rule.id}`,
        tenantId: rule.tenantId,
        name: `Inline: ${rule.name}`,
        eventType: context.eventType,
        subject: rule.templateSubject,
        body: rule.templateBody,
        channel: rule.channels[0] as NotificationChannel,
        variables: this.templateRenderer.extractVariables(rule.templateBody),
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as NotificationTemplate;
    }

    // TODO: Support linking to a stored template by ID
    // For now, fall back to system template
    const systemTemplate = await this.templateRepo.findOne({
      where: {
        tenantId: context.tenant.id,
        eventType: context.eventType,
        channel: In(rule.channels),
        isSystem: true,
      },
      order: { channel: "ASC" }, // Prefer console > email > sms > whatsapp order
    });

    return systemTemplate;
  }

  /**
   * Render the template for each channel in the rule.
   */
  private async renderForChannels(
    rule: NotificationRule,
    template: NotificationTemplate,
    context: EvaluationContext,
  ): Promise<Array<{ channel: NotificationChannel; subject: string | null; body: string }>> {
    const results: Array<{ channel: NotificationChannel; subject: string | null; body: string }> = [];

    // Build rendering context
    const renderContext = this.buildRenderContext(context);

    for (const channel of rule.channels) {
      const renderResult = this.templateRenderer.render(
        template.subject,
        template.body,
        renderContext,
        channel as NotificationChannel,
      );

      if (renderResult.missingRequiredVariables.length > 0) {
        this.logger.warn(
          `Template for rule ${rule.id} channel ${channel} missing required variables: ${renderResult.missingRequiredVariables.join(", ")}`,
        );
      }

      results.push({
        channel: channel as NotificationChannel,
        subject: renderResult.subject,
        body: renderResult.body,
      });
    }

    return results;
  }

  /**
   * Build the rendering context from appointment, customer, and tenant data.
   */
  private buildRenderContext(context: EvaluationContext): Record<string, string | undefined> {
    const { tenant, appointment, customer, eventType } = context;
    const startTime = appointment.startTime;
    const when = startTime.toLocaleString("en-LK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Colombo",
    });
    const datePart = startTime.toLocaleDateString("en-LK", {
      dateStyle: "medium",
      timeZone: "Asia/Colombo",
    });
    const timePart = startTime.toLocaleTimeString("en-LK", {
      timeStyle: "short",
      timeZone: "Asia/Colombo",
    });

    // Service names - would come from appointment-service relation
    // For now, use a placeholder
    const serviceNames = "Service";

    // Build URLs (these would be configured per tenant)
    const baseUrl = (tenant.settings as any)?.publicBookingUrl || "https://salon.example.com";
    const cancelUrl = `${baseUrl}/cancel/${appointment.bookingReference}`;
    const rescheduleUrl = `${baseUrl}/reschedule/${appointment.bookingReference}`;
    const reviewUrl = `${baseUrl}/review/${appointment.bookingReference}`;

    return {
      // Customer
      customerName: `${customer.firstName} ${customer.lastName}`,
      customerEmail: customer.email || undefined,
      customerPhone: customer.phone,

      // Appointment
      appointmentDate: datePart,
      appointmentTime: timePart,
      appointmentDateTime: when,
      appointmentTimezone: "Asia/Colombo",
      staffName: appointment.staff?.name || "Staff",
      serviceNames,
      bookingReference: appointment.bookingReference,
      cancelUrl,
      rescheduleUrl,

      // Salon
      salonName: tenant.name,
      salonPhone: undefined, // Would come from tenant settings if added
      salonEmail: undefined, // Would come from tenant settings if added
      salonAddress: undefined, // Would come from tenant settings if added

      // Transaction (totalCents is in cents, convert to LKR)
      totalAmount: appointment.totalCents
        ? new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(appointment.totalCents / 100)
        : undefined,
      paymentMethod: undefined, // Not directly on appointment

      // Event-specific
      ...(eventType === NotificationEvent.WINBACK_OFFER && {
        reviewUrl,
      }),
    };
  }

  /**
   * Execute the evaluated notifications (send them).
   * This is separated from evaluation for testing and observability.
   */
  async execute(results: EvaluationResult[]): Promise<void> {
    for (const result of results) {
      if (!result.shouldSend) continue;

      // For now, use the existing notification service
      // In the future, this would use a multi-channel sender
      for (const channel of result.matchedChannels) {
        // The notification service's fire method handles CONSOLE + EMAIL
        // We need to extend it for SMS/WhatsApp
        this.logger.log(
          `Would send ${result.rule.name} via ${channel} to ${result.matchedChannels.join(", ")}`,
        );
      }
    }
  }

  /**
   * Find rules that should fire for a specific event type and timing.
   * Used by the scheduler for reminder scans.
   */
  async findRulesForReminderScan(
    tenantId: string,
    offsetHours: number,
  ): Promise<NotificationRule[]> {
    return this.ruleRepo
      .createQueryBuilder("rule")
      .where("rule.tenantId = :tenantId", { tenantId })
      .andWhere("rule.isEnabled = true")
      .andWhere("rule.timingType = 'BEFORE_APPT'")
      .andWhere("rule.timingValue->>'offsetHours' = :offsetHours", { offsetHours: String(offsetHours) })
      .orderBy("rule.priority", "DESC")
      .getMany();
  }

  /**
   * Evaluate a test notification and send it.
   * Used by POST /notifications/test endpoint.
   */
  async evaluateAndSendTest(
    tenantId: string,
    dto: TestNotificationDto,
  ): Promise<{ success: boolean; message: string; results: EvaluationResult[] }> {
    // Create a mock appointment and customer for testing
    const mockAppointment = {
      id: dto.appointmentId || "test-appointment-id",
      tenantId,
      staffId: "test-staff-id",
      staff: { name: "Test Staff" },
      startTime: dto.mockData?.startTime ? new Date(dto.mockData.startTime as string) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      totalCents: dto.mockData?.totalCents ? Number(dto.mockData.totalCents) : 5000,
      bookingReference: dto.mockData?.bookingReference as string || "TEST-123",
      source: dto.mockData?.source as string || "web",
      status: "CONFIRMED" as any,
      customer: null,
    } as unknown as Appointment;

    const mockCustomer = {
      id: "test-customer-id",
      tenantId,
      firstName: (dto.mockData?.customerFirstName as string) || "Test",
      lastName: (dto.mockData?.customerLastName as string) || "Customer",
      email: (dto.mockData?.customerEmail as string) || "test@example.com",
      phone: (dto.mockData?.customerPhone as string) || "+1234567890",
      marketingOptOut: false,
    } as unknown as Customer;

    const mockTenant = {
      id: tenantId,
      name: "Test Salon",
      settings: {
        reminderOffsets: [24, 2],
        publicBookingUrl: "https://test.example.com",
      },
    } as unknown as Tenant;

    // Create a temporary rule for testing
    const testRule: NotificationRule = {
      id: "test-rule",
      tenantId,
      name: "Test Rule",
      timingType: "DAY_OF_APPT" as any,
      timingValue: {},
      channels: dto.channels,
      targeting: {},
      isEnabled: true,
      priority: 0,
      templateSubject: dto.templateSubject,
      templateBody: dto.templateBody,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as NotificationRule;

    const context: EvaluationContext = {
      tenant: mockTenant,
      appointment: mockAppointment,
      customer: mockCustomer,
      eventType: dto.eventType,
      now: new Date(),
    };

    // Override template resolution for test
    if (dto.templateBody) {
      const template: NotificationTemplate = {
        id: "test-template",
        tenantId,
        name: "Test Template",
        eventType: dto.eventType,
        subject: dto.templateSubject,
        body: dto.templateBody,
        channel: dto.channels[0],
        variables: this.templateRenderer.extractVariables(dto.templateBody),
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as NotificationTemplate;

      const channelResults = await this.renderForChannels(testRule, template, context);
      
      const results: EvaluationResult[] = channelResults.map((c) => ({
        shouldSend: true,
        rule: testRule,
        matchedChannels: [c.channel],
        matchedTemplate: template,
        renderedSubject: c.subject,
        renderedBody: c.body,
      }));

      // Actually send the test notifications
      // For now, just log - in production would use multi-channel sender
      this.logger.log(`Test notification evaluation complete: ${results.length} channels`);

      return {
        success: true,
        message: `Test notification evaluated for ${results.length} channel(s)`,
        results,
      };
    }

    return {
      success: false,
      message: "No template body provided for test",
      results: [],
    };
  }
}
