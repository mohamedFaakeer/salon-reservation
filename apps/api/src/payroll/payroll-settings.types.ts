import type { PayCalendarConfig } from "./payroll.domain";

export interface PayrollSettingsView {
  payCalendar: PayCalendarConfig;
  statutoryPayrollEnabled: boolean;
  /** The rates currently in force, only when `statutoryPayrollEnabled` — a tenant not enabled for this never sees the platform's rate table. */
  statutoryRuleSet: {
    epfEmployeePercent: number;
    epfEmployerPercent: number;
    etfEmployerPercent: number;
    apitMonthlyFreeThresholdCents: number;
    verified: boolean;
  } | null;
}
