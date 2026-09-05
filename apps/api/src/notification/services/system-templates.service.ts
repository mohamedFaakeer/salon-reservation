import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { NotificationTemplate } from "../../entities/notification-template.entity";
import { NotificationChannel, NotificationEvent } from "@salon/shared";

/**
 * System templates that are automatically created for new tenants.
 * These provide sensible defaults for common notification scenarios.
 */
interface SystemTemplate {
  name: string;
  subject: string | null;
  body: string;
  channel: NotificationChannel;
  variables: string[];
  isSystem: true;
  eventType: NotificationEvent;
}

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // BOOKING_CONFIRMATION
  {
    name: "Booking Confirmation (Email)",
    eventType: NotificationEvent.BOOKING_CONFIRMATION,
    subject: "Booking confirmed — {{bookingReference}}",
    body: `Dear {{customerName}},

Your appointment is confirmed!

📅 **Date:** {{appointmentDate}}
⏰ **Time:** {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

{{#if cancelUrl}}
Need to cancel? [Click here]({{cancelUrl}})
{{/if}}

{{#if rescheduleUrl}}
Need to reschedule? [Click here]({{rescheduleUrl}})
{{/if}}

We look forward to seeing you!

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "cancelUrl",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "Booking Confirmation (SMS)",
    eventType: NotificationEvent.BOOKING_CONFIRMATION,
    subject: null,
    body: `Hi {{customerName}}, your appointment is confirmed for {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Ref: {{bookingReference}}. {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Booking Confirmation (WhatsApp)",
    eventType: NotificationEvent.BOOKING_CONFIRMATION,
    subject: null,
    body: `Hi {{customerName}}! ✨

Your appointment is *confirmed*:
📅 {{appointmentDate}}
⏰ {{appointmentTime}}
👤 {{staffName}}
💇 {{serviceNames}}
🔖 {{bookingReference}}

{{#if cancelUrl}}
Cancel: {{cancelUrl}}
{{/if}}

{{#if rescheduleUrl}}
Reschedule: {{rescheduleUrl}}
{{/if}}

See you soon!

— {{salonName}}`,
    channel: NotificationChannel.WHATSAPP,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "cancelUrl",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Booking Confirmation (Console)",
    eventType: NotificationEvent.BOOKING_CONFIRMATION,
    subject: "Booking confirmed — {{bookingReference}}",
    body: `Booking confirmed for {{customerName}} on {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
    ],
    isSystem: true,
  },

  // PAYMENT_CONFIRMATION
  {
    name: "Payment Confirmation (Email)",
    eventType: NotificationEvent.PAYMENT_CONFIRMATION,
    subject: "Payment received — {{bookingReference}}",
    body: `Dear {{customerName}},

Thank you for your payment!

📅 **Appointment:** {{appointmentDate}} at {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}
💰 **Amount:** {{totalAmount}}
💳 **Method:** {{paymentMethod}}

Your payment has been successfully processed.

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "totalAmount",
      "paymentMethod",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "Payment Confirmation (SMS)",
    eventType: NotificationEvent.PAYMENT_CONFIRMATION,
    subject: null,
    body: `Thanks {{customerName}}! Payment of {{totalAmount}} received for your appointment on {{appointmentDate}} (Ref: {{bookingReference}}). {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "totalAmount",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Payment Confirmation (Console)",
    eventType: NotificationEvent.PAYMENT_CONFIRMATION,
    subject: "Payment received — {{bookingReference}}",
    body: `Payment of {{totalAmount}} received from {{customerName}} for appointment {{bookingReference}} on {{appointmentDate}}. Method: {{paymentMethod}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "totalAmount",
      "bookingReference",
      "paymentMethod",
    ],
    isSystem: true,
  },

  // REMINDER_24H
  {
    name: "24-Hour Reminder (Email)",
    eventType: NotificationEvent.REMINDER_24H,
    subject: "Reminder: Tomorrow with {{staffName}}",
    body: `Dear {{customerName}},

This is a friendly reminder about your appointment tomorrow.

📅 **Date:** {{appointmentDate}}
⏰ **Time:** {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

{{#if cancelUrl}}
Need to cancel? [Click here]({{cancelUrl}})
{{/if}}

{{#if rescheduleUrl}}
Need to reschedule? [Click here]({{rescheduleUrl}})
{{/if}}

See you tomorrow!

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonAddress}} | {{salonAddress}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "cancelUrl",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonAddress",
    ],
    isSystem: true,
  },
  {
    name: "24-Hour Reminder (SMS)",
    eventType: NotificationEvent.REMINDER_24H,
    subject: null,
    body: `Reminder: Your appointment is tomorrow, {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Ref: {{bookingReference}}. {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "24-Hour Reminder (WhatsApp)",
    eventType: NotificationEvent.REMINDER_24H,
    subject: null,
    body: `Hi {{customerName}}! ⏰

Just a reminder — your appointment is *tomorrow*:
📅 {{appointmentDate}}
⏰ {{appointmentTime}}
👤 {{staffName}}
💇 {{serviceNames}}
🔖 {{bookingReference}}

{{#if cancelUrl}}
Cancel: {{cancelUrl}}
{{/if}}

{{#if rescheduleUrl}}
Reschedule: {{rescheduleUrl}}
{{/if}}

— {{salonName}}`,
    channel: NotificationChannel.WHATSAPP,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "cancelUrl",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "24-Hour Reminder (Console)",
    eventType: NotificationEvent.REMINDER_24H,
    subject: "Reminder: Tomorrow with {{staffName}}",
    body: `24h reminder for {{customerName}}: appointment tomorrow at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
    ],
    isSystem: true,
  },

  // REMINDER_2H
  {
    name: "2-Hour Reminder (Email)",
    eventType: NotificationEvent.REMINDER_2H,
    subject: "Reminder: Coming up soon",
    body: `Dear {{customerName}},

Your appointment is coming up in about 2 hours!

📅 **Date:** {{appointmentDate}}
⏰ **Time:** {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

We look forward to seeing you soon!

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonAddress}} | {{salonAddress}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
      "salonPhone",
      "salonAddress",
    ],
    isSystem: true,
  },
  {
    name: "2-Hour Reminder (SMS)",
    eventType: NotificationEvent.REMINDER_2H,
    subject: null,
    body: `Reminder: Your appointment with {{staffName}} is in ~2 hours ({{appointmentTime}} today). Ref: {{bookingReference}}. {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "2-Hour Reminder (WhatsApp)",
    eventType: NotificationEvent.REMINDER_2H,
    subject: null,
    body: `Hi {{customerName}}! ⚡

Your appointment is in *about 2 hours*:
⏰ {{appointmentTime}} today
👤 {{staffName}}
💇 {{serviceNames}}
🔖 {{bookingReference}}

See you soon!

— {{salonName}}`,
    channel: NotificationChannel.WHATSAPP,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "2-Hour Reminder (Console)",
    eventType: NotificationEvent.REMINDER_2H,
    subject: "Reminder: Coming up soon",
    body: `2h reminder for {{customerName}}: appointment at {{appointmentTime}} today with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
    ],
    isSystem: true,
  },

  // CANCELLATION_CONFIRMATION
  {
    name: "Cancellation Confirmation (Email)",
    eventType: NotificationEvent.CANCELLATION_CONFIRMATION,
    subject: "Booking cancelled — {{bookingReference}}",
    body: `Dear {{customerName}},

Your appointment has been cancelled.

📅 **Was scheduled for:** {{appointmentDate}} at {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

{{#if rescheduleUrl}}
Want to rebook? [Click here]({{rescheduleUrl}})
{{/if}}

We hope to see you another time!

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "Cancellation Confirmation (SMS)",
    eventType: NotificationEvent.CANCELLATION_CONFIRMATION,
    subject: null,
    body: `Your appointment on {{appointmentDate}} at {{appointmentTime}} (Ref: {{bookingReference}}) has been cancelled. {{#if rescheduleUrl}}Rebook: {{rescheduleUrl}}{{/if}} {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "bookingReference",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Cancellation Confirmation (Console)",
    eventType: NotificationEvent.CANCELLATION_CONFIRMATION,
    subject: "Booking cancelled — {{bookingReference}}",
    body: `Appointment cancelled for {{customerName}}: was {{appointmentDate}} at {{appointmentTime}} (Ref: {{bookingReference}})`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "bookingReference",
    ],
    isSystem: true,
  },

  // RESCHEDULE_CONFIRMATION
  {
    name: "Reschedule Confirmation (Email)",
    eventType: NotificationEvent.RESCHEDULE_CONFIRMATION,
    subject: "Booking rescheduled — {{bookingReference}}",
    body: `Dear {{customerName}},

Your appointment has been rescheduled.

📅 **New Date:** {{appointmentDate}}
⏰ **New Time:** {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

{{#if cancelUrl}}
Need to cancel? [Click here]({{cancelUrl}})
{{/if}}

{{#if rescheduleUrl}}
Need to reschedule again? [Click here]({{rescheduleUrl}})
{{/if}}

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "cancelUrl",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "Reschedule Confirmation (SMS)",
    eventType: NotificationEvent.RESCHEDULE_CONFIRMATION,
    subject: null,
    body: `Your appointment has been rescheduled to {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Ref: {{bookingReference}}. {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Reschedule Confirmation (Console)",
    eventType: NotificationEvent.RESCHEDULE_CONFIRMATION,
    subject: "Booking rescheduled — {{bookingReference}}",
    body: `Appointment rescheduled for {{customerName}} to {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
    ],
    isSystem: true,
  },

  // NO_SHOW
  {
    name: "No-Show Notification (Email)",
    eventType: NotificationEvent.NO_SHOW,
    subject: "Missed appointment — {{bookingReference}}",
    body: `Dear {{customerName}},

We missed you at your appointment today.

📅 **Was scheduled for:** {{appointmentDate}} at {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

{{#if rescheduleUrl}}
Want to rebook? [Click here]({{rescheduleUrl}})
{{/if}}

Please contact us if you'd like to reschedule.

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "No-Show Notification (SMS)",
    eventType: NotificationEvent.NO_SHOW,
    subject: null,
    body: `We missed you today, {{customerName}}! Your appointment was at {{appointmentTime}} with {{staffName}} (Ref: {{bookingReference}}). {{#if rescheduleUrl}}Rebook: {{rescheduleUrl}}{{/if}} {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "No-Show Notification (Console)",
    eventType: NotificationEvent.NO_SHOW,
    subject: "Missed appointment — {{bookingReference}}",
    body: `No-show recorded for {{customerName}}: appointment was {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
    ],
    isSystem: true,
  },

  // LATE_ARRIVAL
  {
    name: "Late Arrival Notification (Email)",
    eventType: NotificationEvent.LATE_ARRIVAL,
    subject: "Late arrival noted — {{bookingReference}}",
    body: `Dear {{customerName}},

We noted your late arrival for today's appointment.

📅 **Date:** {{appointmentDate}}
⏰ **Scheduled Time:** {{appointmentTime}}
👤 **Staff:** {{staffName}}
💇 **Services:** {{serviceNames}}
🔖 **Reference:** {{bookingReference}}

Your service may be shortened to accommodate the schedule. Please arrive on time for future appointments.

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "serviceNames",
      "bookingReference",
      "salonName",
      "salonPhone",
    ],
    isSystem: true,
  },
  {
    name: "Late Arrival Notification (SMS)",
    eventType: NotificationEvent.LATE_ARRIVAL,
    subject: null,
    body: `Late arrival noted for {{customerName}}'s appointment at {{appointmentTime}} with {{staffName}} (Ref: {{bookingReference}}). Service may be shortened. {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Late Arrival Notification (Console)",
    eventType: NotificationEvent.LATE_ARRIVAL,
    subject: "Late arrival noted — {{bookingReference}}",
    body: `Late arrival for {{customerName}}: appointment at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "appointmentDate",
      "appointmentTime",
      "staffName",
      "bookingReference",
    ],
    isSystem: true,
  },

  // WINBACK_OFFER
  {
    name: "Win-Back Offer (Email)",
    eventType: NotificationEvent.WINBACK_OFFER,
    subject: "We miss you! Special offer inside",
    body: `Dear {{customerName}},

We haven't seen you in a while and we miss you! 💖

As a valued customer, here's a special offer just for you:
**20% off your next visit!**

{{#if rescheduleUrl}}
[Book now and claim your discount]({{rescheduleUrl}})
{{/if}}

This offer expires in 30 days.

We'd love to welcome you back!

— {{salonName}}
{{#if salonPhone}} | {{salonPhone}}{{/if}}
{{#if salonEmail}} | {{salonEmail}}{{/if}}`,
    channel: NotificationChannel.EMAIL,
    variables: [
      "customerName",
      "rescheduleUrl",
      "salonName",
      "salonPhone",
      "salonEmail",
    ],
    isSystem: true,
  },
  {
    name: "Win-Back Offer (SMS)",
    eventType: NotificationEvent.WINBACK_OFFER,
    subject: null,
    body: `We miss you, {{customerName}}! 💖 Enjoy 20% off your next visit. {{#if rescheduleUrl}}Book: {{rescheduleUrl}}{{/if}} Expires in 30 days. — {{salonName}}`,
    channel: NotificationChannel.SMS,
    variables: [
      "customerName",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Win-Back Offer (WhatsApp)",
    eventType: NotificationEvent.WINBACK_OFFER,
    subject: null,
    body: `Hi {{customerName}}! 👋

We miss you at {{salonName}}! 💖

Here's a special *welcome back* offer: **20% off** your next visit!

{{#if rescheduleUrl}}
[Book now]({{rescheduleUrl}})
{{/if}}

Expires in 30 days. Hope to see you soon!

— {{salonName}}`,
    channel: NotificationChannel.WHATSAPP,
    variables: [
      "customerName",
      "rescheduleUrl",
      "salonName",
    ],
    isSystem: true,
  },
  {
    name: "Win-Back Offer (Console)",
    eventType: NotificationEvent.WINBACK_OFFER,
    subject: "Win-back offer sent",
    body: `Win-back offer sent to {{customerName}}: 20% off next visit. {{salonName}}`,
    channel: NotificationChannel.CONSOLE,
    variables: [
      "customerName",
      "salonName",
    ],
    isSystem: true,
  },
];

@Injectable()
export class SystemTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(SystemTemplatesService.name);

  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
  ) {}

  async onModuleInit(): Promise<void> {
    // System templates are seeded per-tenant when tenants are created
    // This service provides the seeding logic for new tenants
  }

  /**
   * Seed system templates for a specific tenant.
   * Called when a new tenant is created or on demand.
   */
  async seedForTenant(tenantId: string): Promise<NotificationTemplate[]> {
    const existing = await this.templateRepo.find({
      where: { tenantId, isSystem: true },
    });

    const existingKeys = new Set(existing.map((t) => `${t.eventType}-${t.channel}`));
    const toCreate: NotificationTemplate[] = [];

    for (const sysTemplate of SYSTEM_TEMPLATES) {
      const key = `${sysTemplate.eventType}-${sysTemplate.channel}`;
      if (!existingKeys.has(key)) {
        const template = this.templateRepo.create({
          tenantId,
          name: sysTemplate.name,
          subject: sysTemplate.subject,
          body: sysTemplate.body,
          channel: sysTemplate.channel,
          variables: sysTemplate.variables,
          isSystem: sysTemplate.isSystem,
        });
        toCreate.push(template);
      }
    }

    if (toCreate.length > 0) {
      const saved = await this.templateRepo.save(toCreate);
      this.logger.log(`Seeded ${saved.length} system templates for tenant ${tenantId}`);
      return saved;
    }

    return [];
  }

  /**
   * Get all system template definitions (for reference/preview).
   */
  getSystemTemplateDefinitions(): SystemTemplate[] {
    return SYSTEM_TEMPLATES;
  }

  /**
   * Get system templates for a specific event and channel.
   */
  getSystemTemplate(eventType: NotificationEvent, channel: NotificationChannel): SystemTemplate | undefined {
    return SYSTEM_TEMPLATES.find(
      (t) => t.eventType === eventType && t.channel === channel,
    );
  }

  /**
   * Reset a tenant's system templates to defaults (useful for recovery).
   */
  async resetTenantSystemTemplates(tenantId: string): Promise<NotificationTemplate[]> {
    // Delete existing system templates for this tenant
    await this.templateRepo.delete({ tenantId, isSystem: true });
    // Re-seed
    return this.seedForTenant(tenantId);
  }
}