import type { PayFrequency } from "@salon/shared";

export interface EmploymentView {
  id: string;
  staffId: string;
  staffName: string;
  payFrequency: PayFrequency;
  baseRateCents: number;
  effectiveFrom: string;
  /** `null` = this is the currently open version. */
  effectiveTo: string | null;
  supersedesEmploymentId: string | null;
  createdByName: string;
  createdAt: string;
}
