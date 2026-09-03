export interface StatutoryPreviewView {
  staffId: string;
  staffName: string;
  from: string;
  to: string;
  grossCents: number;
  epfEmployeeCents: number;
  epfEmployerCents: number;
  etfEmployerCents: number;
  apitCents: number;
  netCents: number;
  /** Whether a qualified professional has confirmed the rule set this figure was computed against. Always surface this alongside the numbers. */
  verified: boolean;
  ruleSetId: string;
}
