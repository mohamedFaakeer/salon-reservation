import type { PayrollRunStatus } from "@salon/shared";
import type { PayrollRunLine } from "../entities/payroll-run.entity";

export interface PayrollRunView {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  staffCount: number;
  totalGrossCents: number;
  totalNetCents: number;
  lines: PayrollRunLine[];
  submittedByName: string;
  submittedAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  paidByName: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  voidedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}
