"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  fetchIncentivePlans,
  fetchStaff,
  type IncentivePlanView,
  type StaffMember,
} from "../../../lib/api-client";
import { formatPriceCents } from "../../../lib/format";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row, RowActions } from "../../../components/data-table";
import { IncentivePlanDrawer } from "../../../components/incentive-plan-drawer";
import { ModuleGate } from "../../../components/module-gate";

export default function IncentivesPageGated() {
  return (
    <ModuleGate module="incentives" label="Incentives">
      <IncentivesPage />
    </ModuleGate>
  );
}

function IncentivesPage() {
  const [plans, setPlans] = useState<IncentivePlanView[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<IncentivePlanView | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchIncentivePlans(), fetchStaff()])
      .then(([p, s]) => {
        setPlans(p);
        setStaff(s);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load incentive plans.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const assignedBy = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of staff) {
      if (!s.incentivePlanId) continue;
      const names = map.get(s.incentivePlanId) ?? [];
      names.push(s.name);
      map.set(s.incentivePlanId, names);
    }
    return map;
  }, [staff]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Incentive plans</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {plans.length} plan{plans.length === 1 ? "" : "s"} · {staff.filter((s) => s.incentivePlanId).length}{" "}
            stylists assigned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/incentives/payouts"
            className="flex min-h-11 items-center rounded border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Run a payout
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            New plan
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No incentive plans yet — create one to start paying commission."
          action={{ label: "New plan", onClick: () => setCreating(true) }}
        />
      ) : (
        <DataTable
          caption="Incentive plans configured for this salon"
          columns={[
            { label: "Plan" },
            { label: "Base" },
            { label: "Per job" },
            { label: "Tier bonus" },
            { label: "Assigned" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {plans.map((plan) => {
            const names = assignedBy.get(plan.id) ?? [];
            return (
              <Row key={plan.id}>
                <Cell>
                  <span className="font-medium text-slate-900">{plan.name}</span>
                </Cell>
                <Cell>
                  {plan.baseCommissionPercent !== null ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {plan.baseCommissionPercent}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell>
                  {plan.perJobAmountCents !== null ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {formatPriceCents(plan.perJobAmountCents)} / job
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell>
                  {plan.monthlyTargetCents !== null && plan.tierBonusPercent !== null ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {plan.tierBonusPercent}% past {formatPriceCents(plan.monthlyTargetCents)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </Cell>
                <Cell>
                  {names.length > 0 ? (
                    <span className="text-slate-700">{names.join(", ")}</span>
                  ) : (
                    <span className="text-xs text-slate-400">Nobody yet</span>
                  )}
                </Cell>
                <RowActions>
                  <button
                    type="button"
                    onClick={() => setEditing(plan)}
                    className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    Edit
                  </button>
                </RowActions>
              </Row>
            );
          })}
        </DataTable>
      )}

      {creating ? (
        <IncentivePlanDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}
      {editing ? (
        <IncentivePlanDrawer
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
