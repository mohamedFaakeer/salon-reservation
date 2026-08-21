/**
 * What a plan pays, worked out from facts the caller has already gathered.
 *
 * Nothing here reads a repository. The service resolves a range into a flat
 * list of paid service lines and hands them here, so the same function
 * prices a live preview and — in the payout phase — the figure that gets
 * frozen and paid, and the two can never quietly disagree.
 *
 * Revenue means money *received*, not money billed — the same rule the
 * Reports module already established: a completed appointment nobody paid
 * for has not earned anyone a commission yet.
 */

export interface PlanComponents {
  baseCommissionPercent: number | null;
  perJobAmountCents: number | null;
  monthlyTargetCents: number | null;
  tierBonusPercent: number | null;
  /** serviceId → rate percent, overriding the base for that service only. */
  serviceRates: Map<string, number>;
}

/**
 * One paid service line a stylist performed. `receivedCents` is that line's
 * own share of whatever was actually collected on its appointment — see
 * `allocateReceivedByLine` for how a partial payment splits across lines
 * that were billed different amounts.
 */
export interface EarningLine {
  serviceId: string | null;
  receivedCents: number;
  /** True once the appointment reached COMPLETED — a job "done", for the flat per-job component. */
  jobCompleted: boolean;
}

export interface IncentiveBreakdown {
  revenueCents: number;
  commissionCents: number;
  jobsCompleted: number;
  perJobCents: number;
  tierBonusCents: number;
  totalCents: number;
}

/** The rate a line earns at: its own service's override, or the plan's base. Neither present is 0. */
function rateFor(plan: PlanComponents, serviceId: string | null): number {
  if (serviceId !== null) {
    const own = plan.serviceRates.get(serviceId);
    if (own !== undefined) {
      return own;
    }
  }
  return plan.baseCommissionPercent ?? 0;
}

export function computeIncentive(plan: PlanComponents, lines: EarningLine[]): IncentiveBreakdown {
  const revenueCents = lines.reduce((sum, l) => sum + l.receivedCents, 0);

  const commissionCents =
    plan.baseCommissionPercent !== null || plan.serviceRates.size > 0
      ? lines.reduce((sum, l) => sum + Math.round((l.receivedCents * rateFor(plan, l.serviceId)) / 100), 0)
      : 0;

  const jobsCompleted = lines.filter((l) => l.jobCompleted).length;
  const perJobCents = plan.perJobAmountCents !== null ? plan.perJobAmountCents * jobsCompleted : 0;

  let tierBonusCents = 0;
  if (plan.monthlyTargetCents !== null && plan.tierBonusPercent !== null) {
    const excess = Math.max(0, revenueCents - plan.monthlyTargetCents);
    tierBonusCents = Math.round((excess * plan.tierBonusPercent) / 100);
  }

  return {
    revenueCents,
    commissionCents,
    jobsCompleted,
    perJobCents,
    tierBonusCents,
    totalCents: commissionCents + perJobCents + tierBonusCents,
  };
}

/**
 * A payment is recorded against a whole appointment, never a single service
 * line — so a partial payment has no line of its own to belong to. Splitting
 * it proportionally by what each line was actually charged (list price less
 * any offer, never the list price itself) is the only allocation that
 * reduces correctly to "the whole line" once the appointment is paid in
 * full, and to "nothing" for a line that was free.
 *
 * A fully-discounted appointment (chargedTotalCents = 0) has nothing to
 * allocate; every line gets 0 rather than a division by zero.
 */
export function allocateReceivedByLine(
  receivedCents: number,
  lines: Array<{ chargedCents: number }>,
): number[] {
  const chargedTotalCents = lines.reduce((sum, l) => sum + l.chargedCents, 0);
  if (chargedTotalCents <= 0 || receivedCents <= 0) {
    return lines.map(() => 0);
  }
  return lines.map((l) => Math.round((receivedCents * l.chargedCents) / chargedTotalCents));
}
