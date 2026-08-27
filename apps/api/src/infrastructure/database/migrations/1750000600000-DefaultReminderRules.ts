import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * DECISIONS.md §39 — the Notification Rules engine (`notification_rule`)
 * replaces the old hardcoded 24h/2h console+email reminder scan, which used
 * to fire unconditionally outside any Rule. Every ACTIVE tenant gets the
 * same two reminders seeded here as real, editable Rules (console+email,
 * same offsets), so existing behavior is unchanged the moment this runs —
 * an Owner now sees them in Notifications > Rules and can edit channels
 * (e.g. add SMS) or timing instead of the old behavior being invisible and
 * fixed in code.
 */
export class DefaultReminderRules1750000600000 implements MigrationInterface {
  name = "DefaultReminderRules1750000600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notification_rule"
        ("tenantId", "name", "timingType", "timingValue", "channels", "templateSubject", "templateBody", "targeting", "isEnabled", "priority")
      SELECT t."id",
        '24h Reminder (default)',
        'BEFORE_APPT',
        '{"offsetHours": 24}'::jsonb,
        ARRAY['console', 'email'],
        'Reminder: your appointment tomorrow with {{staffName}}',
        'Hi {{customerName}}, this is a reminder for your {{serviceNames}} on {{appointmentDate}} at {{appointmentTime}} with {{staffName}}. Ref: {{bookingReference}}.',
        '{}'::jsonb,
        true,
        0
      FROM "tenant" t
      WHERE t."status" = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_rule" r
          WHERE r."tenantId" = t."id" AND r."timingType" = 'BEFORE_APPT' AND r."timingValue"->>'offsetHours' = '24'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "notification_rule"
        ("tenantId", "name", "timingType", "timingValue", "channels", "templateSubject", "templateBody", "targeting", "isEnabled", "priority")
      SELECT t."id",
        '2h Reminder (default)',
        'BEFORE_APPT',
        '{"offsetHours": 2}'::jsonb,
        ARRAY['console', 'email'],
        'Reminder: your appointment is coming up soon',
        'Reminder: your appointment is at {{appointmentTime}} with {{staffName}} ({{serviceNames}}), coming up soon. Ref: {{bookingReference}}.',
        '{}'::jsonb,
        true,
        0
      FROM "tenant" t
      WHERE t."status" = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM "notification_rule" r
          WHERE r."tenantId" = t."id" AND r."timingType" = 'BEFORE_APPT' AND r."timingValue"->>'offsetHours' = '2'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "notification_rule"
      WHERE "name" IN ('24h Reminder (default)', '2h Reminder (default)')
    `);
  }
}
