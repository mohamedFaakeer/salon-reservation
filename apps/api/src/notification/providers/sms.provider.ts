import { Injectable, Logger } from "@nestjs/common";
import { ApiError, normalizeSriLankanPhone } from "@salon/shared";
import type {
  NotificationProvider,
  NotificationSendInput,
  NotificationSendResult,
} from "./notification-provider.interface";

/**
 * Text.lk REST API (DECISIONS.md §38: one shared platform gateway account,
 * a local Sri Lankan aggregator rather than a global provider like Twilio).
 * OAuth 2.0 / Bearer token method, per https://text.lk/docs/send-sms/ —
 * the HTTP-GET/api_token method exists too but Text.lk's own docs say to
 * always use Bearer for new integrations.
 */
const TEXTLK_SEND_URL = "https://app.text.lk/api/v3/sms/send";

interface TextLkSuccessResponse {
  status: "success";
  message: string;
  data: {
    uid: string;
    to: string;
    from: string;
    message: string;
    status: string;
    cost: string;
    sms_count: number;
  };
}

interface TextLkErrorResponse {
  status: "error";
  message: string;
}

/**
 * Falls back to console-logging when `TEXTLK_API_TOKEN` is unset — same
 * pattern as `EmailNotificationProvider`'s unconfigured-SMTP fallback, so a
 * local/demo environment with no gateway credentials never breaks.
 */
@Injectable()
export class SmsNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(SmsNotificationProvider.name);

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const apiToken = process.env.TEXTLK_API_TOKEN?.trim();
    const senderId = process.env.TEXTLK_SENDER_ID?.trim();

    const recipient = normalizeSriLankanPhone(input.recipient);
    if (!recipient) {
      throw new ApiError({
        statusCode: 422,
        code: "INVALID_PHONE_NUMBER",
        message: `"${input.recipient}" is not a valid Sri Lankan mobile number.`,
      });
    }

    if (!apiToken || !senderId) {
      // eslint-disable-next-line no-console
      console.log(`[notification:sms-fallback] to=${recipient}\n${input.body}`);
      return { providerMessageId: null };
    }

    let response: Response;
    try {
      response = await fetch(TEXTLK_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          recipient,
          sender_id: senderId,
          type: "plain",
          message: input.body,
        }),
      });
    } catch (err) {
      this.logger.error("Text.lk request failed", err instanceof Error ? err.stack : String(err));
      throw new ApiError({
        statusCode: 502,
        code: "SMS_GATEWAY_UNREACHABLE",
        message: "Could not reach the SMS gateway. It will be retried.",
      });
    }

    const payload = (await response.json().catch(() => null)) as
      | TextLkSuccessResponse
      | TextLkErrorResponse
      | null;

    if (!response.ok || !payload || payload.status !== "success") {
      const gatewayMessage = payload?.message ?? `HTTP ${response.status}`;
      this.logger.warn(`Text.lk rejected a send to ${recipient}: ${gatewayMessage}`);
      throw new ApiError({
        statusCode: 502,
        code: "SMS_GATEWAY_ERROR",
        message: `SMS gateway error: ${gatewayMessage}`,
      });
    }

    return { providerMessageId: payload.data.uid };
  }
}
