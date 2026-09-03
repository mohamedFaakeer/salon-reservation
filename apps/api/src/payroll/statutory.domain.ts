import type { ApitBand } from "../entities/statutory-rule-set.entity";

export interface StatutoryPercentages {
  epfEmployeePercent: number;
  epfEmployerPercent: number;
  etfEmployerPercent: number;
}

export interface EpfEtfResult {
  epfEmployeeCents: number;
  epfEmployerCents: number;
  etfEmployerCents: number;
}

/**
 * EPF (employee + employer) and ETF (employer-only) — flat percentages of
 * gross earnings, safe to compute on any period since neither is
 * progressive (DECISIONS.md §62's statutory research). Each figure is
 * rounded independently to the nearest cent, which is the rounding rule
 * stored alongside every calculation snapshot (spec §12.1).
 */
export function computeEpfEtf(grossCents: number, rates: StatutoryPercentages): EpfEtfResult {
  return {
    epfEmployeeCents: Math.round((grossCents * rates.epfEmployeePercent) / 100),
    epfEmployerCents: Math.round((grossCents * rates.epfEmployerPercent) / 100),
    etfEmployerCents: Math.round((grossCents * rates.etfEmployerPercent) / 100),
  };
}

/**
 * APIT for one full tax month — the IRD's own Table 01 is a monthly table
 * with no daily/weekly/fortnightly equivalent (DECISIONS.md §62), so this
 * deliberately takes a whole month's gross, never an arbitrary sub-period.
 *
 * Income up to `apitMonthlyFreeThresholdCents` owes nothing; the remainder
 * is taxed band by band against `apitBands`, each ordered ascending with a
 * cumulative `uptoCents` (the last band's `uptoCents` is `null`, meaning
 * "and above"). Each band's tax is rounded independently before summing —
 * the same per-band rounding convention `computeEpfEtf` uses.
 */
export function computeApitForMonth(monthlyGrossCents: number, apitMonthlyFreeThresholdCents: number, bands: ApitBand[]): number {
  const taxableCents = Math.max(0, monthlyGrossCents - apitMonthlyFreeThresholdCents);

  let apitCents = 0;
  let lowerBound = 0;
  for (const band of bands) {
    const upperBound = band.uptoCents;
    const bandWidth = upperBound === null ? taxableCents - lowerBound : Math.min(taxableCents, upperBound) - lowerBound;
    const bandTaxable = Math.max(0, bandWidth);
    apitCents += Math.round((bandTaxable * band.ratePercent) / 100);
    if (upperBound !== null) {
      lowerBound = upperBound;
    }
  }
  return apitCents;
}
