import type { ApitBand } from "../entities/statutory-rule-set.entity";

export interface StatutoryRuleSetView {
  id: string;
  epfEmployeePercent: number;
  epfEmployerPercent: number;
  etfEmployerPercent: number;
  apitMonthlyFreeThresholdCents: number;
  apitBands: ApitBand[];
  verified: boolean;
  sourceNote: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByName: string;
  createdAt: string;
}
