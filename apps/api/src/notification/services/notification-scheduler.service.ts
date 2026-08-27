import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Appointment } from "../../entities/appointment.entity";
import { Tenant } from "../../entities/tenant.entity";
import { Notification } from "../../entities/notification.entity";
import type { EvaluationContext } from "./notification-evaluator.service";
// NotificationEvaluatorService must stay a VALUE import: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationEvaluatorService } from "./notification-evaluator.service";
import { AppointmentStatus } from "@salon/shared";
import { TenantStatus } from "../../enums/tenant-status.enum";
import { NotificationEvent } from "@salon/shared";

/**
 * Scheduler service that runs periodic scans to fire time-based notifications.
 * Primarily handles reminder notifications (24h, 2h before appointments).
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly evaluator: NotificationEvaluatorService,
  ) {}

  /**
   * Runs every minute to check for 2-hour reminders.
   * Finds appointments starting in ~2 hours that haven't had the 2h reminder sent.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanTwoHourReminders(): Promise<void> {
    await this.scanReminders(2, NotificationEvent.REMINDER_2H);
  }

  /**
   * Runs every 5 minutes to check for 24-hour reminders.
   * Finds appointments starting in ~24 hours that haven't had the 24h reminder sent.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scanTwentyFourHourReminders(): Promise<void> {
    await this.scanReminders(24, NotificationEvent.REMINDER_24H);
  }

  /**
   * Generic reminder scanner for a given offset in hours.
   */
  private async scanReminders(offsetHours: number, eventType: NotificationEvent): Promise<void> {
    const now = new Date();
    const targetTime = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
    const windowMinutes = 10; // ±10 minute window around the target time
    const windowStart = new Date(targetTime.getTime() - windowMinutes * 60 * 1000);
    const windowEnd = new Date(targetTime.getTime() + windowMinutes * 60 * 1000);

    this.logger.debug(`Scanning for ${offsetHours}h reminders: window ${windowStart.toISOString()} - ${windowEnd.toISOString()}`);

    // Find active tenants
    const tenants = await this.tenantRepo.find({
      where: { status: TenantStatus.ACTIVE },
      select: { id: true, name: true, settings: true },
    });

    for (const tenant of tenants) {
      try {
        await this.processTenantReminders(tenant, windowStart, windowEnd, offsetHours, eventType, now);
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Error processing ${offsetHours}h reminders for tenant ${tenant.id}: ${err.message}`,
          err.stack,
        );
      }
    }
  }

  /**
   * Process reminders for a single tenant.
   */
  private async processTenantReminders(
    tenant: Tenant,
    windowStart: Date,
    windowEnd: Date,
    offsetHours: number,
    eventType: NotificationEvent,
    now: Date,
  ): Promise<void> {
    // Find appointments in the reminder window
    const appointments = await this.appointmentRepo
      .createQueryBuilder("appt")
      .leftJoinAndSelect("appt.customer", "customer")
      .leftJoinAndSelect("appt.staff", "staff")
      .where("appt.tenantId = :tenantId", { tenantId: tenant.id })
      .andWhere("appt.status IN (:...statuses)", {
        statuses: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
      })
      .andWhere("appt.startTime >= :windowStart", { windowStart })
      .andWhere("appt.startTime <= :windowEnd", { windowEnd })
      .getMany();

    this.logger.debug(`Found ${appointments.length} appointments in ${offsetHours}h window for tenant ${tenant.id}`);

    for (const appointment of appointments) {
      // Check if reminder was already sent (using notification log)
      const alreadySent = await this.wasReminderSent(appointment.id, eventType);
      if (alreadySent) {
        this.logger.debug(`Reminder ${eventType} already sent for appointment ${appointment.id}`);
        continue;
      }

      // Evaluate rules for this appointment
      const context: EvaluationContext = {
        tenant,
        appointment,
        customer: appointment.customer,
        eventType,
        now,
      };

      const results = await this.evaluator.evaluate(context);

      if (results.length > 0) {
        // Actually dispatch — creates real `Notification` rows via
        // NotificationService.sendForRule, which is also what makes them
        // visible in the Activity Log and the dedup check below correct.
        const sent = await this.evaluator.execute(results, context);

        if (sent.length > 0) {
          this.logger.log(
            `Sent ${eventType} reminder for appointment ${appointment.bookingReference} (${sent.length} notification(s))`,
          );
        }
      }
    }
  }

  /**
   * Check if a reminder was already sent for this appointment/event, against
   * the real `notification` table — the same one the Activity Log reads —
   * so this check and what a staff member sees can never disagree.
   */
  private async wasReminderSent(appointmentId: string, eventType: NotificationEvent): Promise<boolean> {
    const count = await this.notificationRepo.count({ where: { appointmentId, type: eventType } });
    return count > 0;
  }

  /**
   * Manual trigger for testing - fires reminders for a specific appointment.
   */
  async triggerRemindersForAppointment(
    appointmentId: string,
    eventType: NotificationEvent,
  ): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: { customer: true, staff: true, tenant: true },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    const context: EvaluationContext = {
      tenant: appointment.tenant,
      appointment,
      customer: appointment.customer,
      eventType,
      now: new Date(),
    };

    const results = await this.evaluator.evaluate(context);
    await this.evaluator.execute(results, context);

    this.logger.log(`Manually triggered ${eventType} for appointment ${appointment.bookingReference}`);
  }

  /**
   * Get upcoming appointments that need reminders (for admin dashboard).
   */
  async getUpcomingReminders(
    tenantId: string,
    hoursAhead: number = 48,
  ): Promise<Array<{
    appointment: Appointment;
    reminderType: "24h" | "2h";
    dueAt: Date;
  }>> {
    const now = new Date();
    const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const appointments = await this.appointmentRepo
      .createQueryBuilder("appt")
      .leftJoinAndSelect("appt.customer", "customer")
      .leftJoinAndSelect("appt.staff", "staff")
      .where("appt.tenantId = :tenantId", { tenantId })
      .andWhere("appt.status IN (:...statuses)", {
        statuses: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
      })
      .andWhere("appt.startTime > :now", { now })
      .andWhere("appt.startTime <= :future", { future })
      .orderBy("appt.startTime", "ASC")
      .getMany();

    const reminders: Array<{
      appointment: Appointment;
      reminderType: "24h" | "2h";
      dueAt: Date;
    }> = [];

    for (const appt of appointments) {
      const startTime = appt.startTime.getTime();
      
      // 24h reminder
      const twentyFourHourDue = startTime - 24 * 60 * 60 * 1000;
      if (twentyFourHourDue > now.getTime() && twentyFourHourDue < future.getTime()) {
        const sent = await this.wasReminderSent(appt.id, NotificationEvent.REMINDER_24H);
        if (!sent) {
          reminders.push({
            appointment: appt,
            reminderType: "24h",
            dueAt: new Date(twentyFourHourDue),
          });
        }
      }

      // 2h reminder
      const twoHourDue = startTime - 2 * 60 * 60 * 1000;
      if (twoHourDue > now.getTime() && twoHourDue < future.getTime()) {
        const sent = await this.wasReminderSent(appt.id, NotificationEvent.REMINDER_2H);
        if (!sent) {
          reminders.push({
            appointment: appt,
            reminderType: "2h",
            dueAt: new Date(twoHourDue),
          });
        }
      }
    }

    return reminders.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
}
