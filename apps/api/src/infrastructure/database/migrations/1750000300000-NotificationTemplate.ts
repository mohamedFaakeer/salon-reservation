import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notification Template table — reusable templates that can be referenced by rules.
 * System templates are seeded on migration run.
 */
export class NotificationTemplate1750000300000 implements MigrationInterface {
  name = "NotificationTemplate1750000300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_template" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "name"       varchar(160) NOT NULL,
        "eventType"  varchar(50) NOT NULL,
        "subject"    text,
        "body"       text NOT NULL,
        "channel"    varchar(10) NOT NULL CHECK ("channel" IN ('console', 'email', 'sms', 'whatsapp')),
        "variables"  jsonb NOT NULL DEFAULT '[]',
        "isSystem"   boolean NOT NULL DEFAULT false,
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_notification_template_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenant"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_template_tenantId" ON "notification_template" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_template_channel" ON "notification_template" ("channel")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_template_isSystem" ON "notification_template" ("isSystem")`);
    await queryRunner.query(`CREATE INDEX "IDX_notification_template_eventType" ON "notification_template" ("eventType")`);

    // Seed system templates
    await this.seedSystemTemplates(queryRunner);
  }

  private async seedSystemTemplates(queryRunner: QueryRunner): Promise<void> {
    const systemTemplates = [
      // BOOKING_CONFIRMATION
      {
        name: "Booking Confirmation (Email)",
        eventType: "BOOKING_CONFIRMATION",
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
        channel: "email",
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
        eventType: "BOOKING_CONFIRMATION",
        subject: null,
        body: `Hi {{customerName}}, your appointment is confirmed for {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Ref: {{bookingReference}}. {{salonName}}`,
        channel: "sms",
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
        eventType: "BOOKING_CONFIRMATION",
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
        channel: "whatsapp",
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
        eventType: "BOOKING_CONFIRMATION",
        subject: "Booking confirmed — {{bookingReference}}",
        body: `Booking confirmed for {{customerName}} on {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "PAYMENT_CONFIRMATION",
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
        channel: "email",
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
        eventType: "PAYMENT_CONFIRMATION",
        subject: null,
        body: `Thanks {{customerName}}! Payment of {{totalAmount}} received for your appointment on {{appointmentDate}} (Ref: {{bookingReference}}). {{salonName}}`,
        channel: "sms",
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
        eventType: "PAYMENT_CONFIRMATION",
        subject: "Payment received — {{bookingReference}}",
        body: `Payment of {{totalAmount}} received from {{customerName}} for appointment {{bookingReference}} on {{appointmentDate}}. Method: {{paymentMethod}}`,
        channel: "console",
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
        eventType: "REMINDER_24H",
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
        channel: "email",
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
        eventType: "REMINDER_24H",
        subject: null,
        body: `Reminder: Your appointment is tomorrow, {{appointmentDate}} at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Ref: {{bookingReference}}. {{salonName}}`,
        channel: "sms",
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
        eventType: "REMINDER_24H",
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
        channel: "whatsapp",
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
        eventType: "REMINDER_24H",
        subject: "Reminder: Tomorrow with {{staffName}}",
        body: `24h reminder for {{customerName}}: appointment tomorrow at {{appointmentTime}} with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "REMINDER_2H",
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
        channel: "email",
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
        eventType: "REMINDER_2H",
        subject: null,
        body: `Reminder: Your appointment with {{staffName}} is in ~2 hours ({{appointmentTime}} today). Ref: {{bookingReference}}. {{salonName}}`,
        channel: "sms",
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
        eventType: "REMINDER_2H",
        subject: null,
        body: `Hi {{customerName}}! ⚡

Your appointment is in *about 2 hours*:
⏰ {{appointmentTime}} today
👤 {{staffName}}
💇 {{serviceNames}}
🔖 {{bookingReference}}

See you soon!

— {{salonName}}`,
        channel: "whatsapp",
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
        eventType: "REMINDER_2H",
        subject: "Reminder: Coming up soon",
        body: `2h reminder for {{customerName}}: appointment at {{appointmentTime}} today with {{staffName}} ({{serviceNames}}). Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "CANCELLATION_CONFIRMATION",
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
        channel: "email",
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
        eventType: "CANCELLATION_CONFIRMATION",
        subject: null,
        body: `Your appointment on {{appointmentDate}} at {{appointmentTime}} (Ref: {{bookingReference}}) has been cancelled. {{#if rescheduleUrl}}Rebook: {{rescheduleUrl}}{{/if}} {{salonName}}`,
        channel: "sms",
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
        eventType: "CANCELLATION_CONFIRMATION",
        subject: "Booking cancelled — {{bookingReference}}",
        body: `Appointment cancelled for {{customerName}}: was {{appointmentDate}} at {{appointmentTime}} (Ref: {{bookingReference}})`,
        channel: "console",
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
        eventType: "RESCHEDULE_CONFIRMATION",
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
        channel: "email",
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
        eventType: "RESCHEDULE_CONFIRMATION",
        subject: null,
        body: `Your appointment has been rescheduled to {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Ref: {{bookingReference}}. {{salonName}}`,
        channel: "sms",
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
        eventType: "RESCHEDULE_CONFIRMATION",
        subject: "Booking rescheduled — {{bookingReference}}",
        body: `Appointment rescheduled for {{customerName}} to {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "NO_SHOW",
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
        channel: "email",
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
        eventType: "NO_SHOW",
        subject: null,
        body: `We missed you today, {{customerName}}! Your appointment was at {{appointmentTime}} with {{staffName}} (Ref: {{bookingReference}}). {{#if rescheduleUrl}}Rebook: {{rescheduleUrl}}{{/if}} {{salonName}}`,
        channel: "sms",
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
        eventType: "NO_SHOW",
        subject: "Missed appointment — {{bookingReference}}",
        body: `No-show recorded for {{customerName}}: appointment was {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "LATE_ARRIVAL",
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
        channel: "email",
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
        eventType: "LATE_ARRIVAL",
        subject: null,
        body: `Late arrival noted for {{customerName}}'s appointment at {{appointmentTime}} with {{staffName}} (Ref: {{bookingReference}}). Service may be shortened. {{salonName}}`,
        channel: "sms",
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
        eventType: "LATE_ARRIVAL",
        subject: "Late arrival noted — {{bookingReference}}",
        body: `Late arrival for {{customerName}}: appointment at {{appointmentTime}} with {{staffName}}. Reference: {{bookingReference}}`,
        channel: "console",
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
        eventType: "WINBACK_OFFER",
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
        channel: "email",
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
        eventType: "WINBACK_OFFER",
        subject: null,
        body: `We miss you, {{customerName}}! 💖 Enjoy 20% off your next visit. {{#if rescheduleUrl}}Book: {{rescheduleUrl}}{{/if}} Expires in 30 days. — {{salonName}}`,
        channel: "sms",
        variables: [
          "customerName",
          "rescheduleUrl",
          "salonName",
        ],
        isSystem: true,
      },
      {
        name: "Win-Back Offer (WhatsApp)",
        eventType: "WINBACK_OFFER",
        subject: null,
        body: `Hi {{customerName}}! 👋

We miss you at {{salonName}}! 💖

Here's a special *welcome back* offer: **20% off** your next visit!

{{#if rescheduleUrl}}
[Book now]({{rescheduleUrl}})
{{/if}}

Expires in 30 days. Hope to see you soon!

— {{salonName}}`,
        channel: "whatsapp",
        variables: [
          "customerName",
          "rescheduleUrl",
          "salonName",
        ],
        isSystem: true,
      },
      {
        name: "Win-Back Offer (Console)",
        eventType: "WINBACK_OFFER",
        subject: "Win-back offer sent",
        body: `Win-back offer sent to {{customerName}}: 20% off next visit. {{salonName}}`,
        channel: "console",
        variables: [
          "customerName",
          "salonName",
        ],
        isSystem: true,
      },
    ];

    for (const template of systemTemplates) {
      await queryRunner.query(`
        INSERT INTO "notification_template" ("tenantId", "name", "eventType", "subject", "body", "channel", "variables", "isSystem")
        SELECT t.id, $1, $2, $3, $4, $5, $6, $7
        FROM "tenant" t
        WHERE t."status" = 'ACTIVE'
        ON CONFLICT DO NOTHING
      `, [template.name, template.eventType, template.subject, template.body, template.channel, JSON.stringify(template.variables), template.isSystem]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_template"`);
  }
}