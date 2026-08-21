import type { DepositBucket, FunnelReport, LossReport } from "../../lib/api-client";
import { formatPriceCents } from "../../lib/format";
import { Card, Panel, Quiet } from "./report-shell";

/**
 * What arrived, and what never showed up.
 *
 * The deposit comparison is the only panel that ends in a recommendation,
 * because it is the only one where the numbers point at a specific setting the
 * owner can change. It is written only when the evidence actually supports it.
 */
export function FunnelPanel({ funnel, losses }: { funnel: FunnelReport; losses: LossReport }) {
  return (
    <Panel title="Inquiries and empty chairs">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <FunnelRow label="Bookings taken" value={funnel.bookingsCreated} />
          <FunnelRow label="Inquiries logged" value={funnel.inquiriesLogged} />
          {funnel.inquiriesLogged > 0 ? (
            <>
              <FunnelRow label="— became bookings" value={funnel.inquiriesConverted} muted />
              <FunnelRow label="— closed, went nowhere" value={funnel.inquiriesClosed} muted />
              <FunnelRow
                label="— still open"
                value={funnel.inquiriesOpen}
                muted
                tone={funnel.inquiriesOpen > 0 ? "warn" : "plain"}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-slate-50/60 px-4 py-2.5">
                <span className="text-sm text-slate-700">
                  <b className="font-semibold tabular">{funnel.conversionPercent}%</b> of inquiries
                  became bookings
                </span>
                {funnel.medianDaysToResolve !== null ? (
                  <span className="text-xs text-slate-500 tabular">
                    median {funnel.medianDaysToResolve} days to answer
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <Quiet>
              No inquiries were logged in this period. They are recorded from the Inquiries tab on
              Appointments.
            </Quiet>
          )}
        </Card>

        <DepositEffect losses={losses} />
      </div>
    </Panel>
  );
}

function FunnelRow({
  label,
  value,
  muted = false,
  tone = "plain",
}: {
  label: string;
  value: number;
  muted?: boolean;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-2.5 last:border-b-0">
      <span className={`text-sm ${muted ? "text-slate-500" : "text-slate-800"}`}>{label}</span>
      <b
        className={`font-semibold tabular ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}
      >
        {value}
      </b>
    </div>
  );
}

function DepositEffect({ losses }: { losses: LossReport }) {
  const { withDeposit, withoutDeposit } = losses.depositEffect;

  return (
    <Card className="p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-500">
        Does taking a deposit stop no-shows?
      </h3>

      <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-slate-200">
        <Bucket label="Deposit paid" bucket={withDeposit} tone="good" />
        <Bucket label="No deposit" bucket={withoutDeposit} tone="warn" />
      </div>

      {(() => {
        const verdict = depositVerdict(losses);
        return verdict ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
            {verdict}
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">
            {/* Refusing to draw a conclusion is the honest output here. A
                comparison needs both sides to have concluded something. */}
            Not enough concluded bookings in this period to compare the two.
          </p>
        );
      })()}
    </Card>
  );
}

function Bucket({
  label,
  bucket,
  tone,
}: {
  label: string;
  bucket: DepositBucket;
  tone: "good" | "warn";
}) {
  return (
    <div className="bg-white px-3.5 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-xl font-semibold tracking-[-0.02em] tabular ${
          bucket.noShowPercent === null
            ? "text-slate-400"
            : tone === "good"
              ? "text-emerald-700"
              : "text-amber-700"
        }`}
      >
        {bucket.noShowPercent === null ? "—" : `${bucket.noShowPercent}%`}
      </p>
      <p className="text-xs text-slate-500 tabular">
        {bucket.noShows} of {bucket.concluded} concluded
      </p>
    </div>
  );
}

/**
 * Only written when both sides concluded something and the gap is wide enough
 * to act on. Two no-shows out of three is not evidence, and a report that
 * recommends a policy change on three bookings would deserve to be ignored.
 */
function depositVerdict(losses: LossReport): string | null {
  const { withDeposit, withoutDeposit } = losses.depositEffect;
  if (withDeposit.noShowPercent === null || withoutDeposit.noShowPercent === null) {
    return null;
  }
  if (withDeposit.concluded < 5 || withoutDeposit.concluded < 5) {
    return null;
  }
  if (withoutDeposit.noShowPercent <= withDeposit.noShowPercent) {
    return `Deposits made no difference in this period: ${withDeposit.noShowPercent}% missed with one against ${withoutDeposit.noShowPercent}% without.`;
  }
  const lostWithout = losses.byStaff.reduce((sum, s) => sum + s.lostCents, 0);
  return `Bookings without a deposit were missed ${ratio(withoutDeposit.noShowPercent, withDeposit.noShowPercent)} — around ${formatPriceCents(lostWithout)} of empty chairs this period. The advance rule is under Settings.`;
}

function ratio(worse: number, better: number): string {
  if (better === 0) {
    return `${worse}% of the time, against none with one`;
  }
  const times = Math.round(worse / better);
  return times >= 2 ? `${times} times as often` : `more often (${worse}% against ${better}%)`;
}
