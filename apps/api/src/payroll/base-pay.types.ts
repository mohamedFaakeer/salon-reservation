import type { BasePayDayResult } from "./base-pay.domain";

export interface BasePayPreviewView {
  staffId: string;
  staffName: string;
  from: string;
  to: string;
  earnedCents: number;
  unpaidAbsenceDays: number;
  unresolvedClosureDays: number;
  daysWithoutEmployment: number;
  days: BasePayDayResult[];
}
