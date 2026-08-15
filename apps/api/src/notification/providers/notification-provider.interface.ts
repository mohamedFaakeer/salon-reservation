export interface NotificationSendInput {
  recipient: string;
  subject: string;
  body: string;
}

export interface NotificationSendResult {
  providerMessageId: string | null;
}

export interface NotificationProvider {
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}
