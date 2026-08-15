import { Injectable } from "@nestjs/common";
import { ApiError } from "@salon/shared";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "./notification-provider.interface";

/**
 * Interface-only stub (PRD §3.10: "sms/whatsapp interfaces defined for real
 * adapters later"). Never resolved for a real send — mirrors the P13
 * `PayHereProvider` precedent.
 */
@Injectable()
export class SmsNotificationProvider implements NotificationProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_input: NotificationSendInput): Promise<NotificationSendResult> {
    throw new ApiError({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
      message: "SMS is not enabled for this environment.",
    });
  }
}
