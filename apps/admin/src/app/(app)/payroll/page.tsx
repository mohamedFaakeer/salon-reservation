"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchEmployment,
  fetchStaff,
  type EmploymentView,
  type StaffMember,
} from "../../../lib/api-client";
import { formatCalendarDate, formatPriceCents } from "../../../lib/format";
import { EmptyState } from "../../../components/empty-state";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { Cell, DataTable, Row, RowActions } from "../../../components/data-table";
import { EmploymentDrawer } from "../../../components/employment-drawer";
import { PayComponentDrawer } from "../../../components/pay-component-drawer";
import { ModuleGate } from "../../../components/module-gate";

export default function PayrollPageGated() {
  return (
    <ModuleGate module="payroll" label="Payroll">
      <PayrollPage />
    </ModuleGate>
  );
}

/**
 * Every active staff member's pay profile, one row each. This is the
 * on-ramp for the whole module — a staff member can't appear on a payroll
 * run until they have one.
 */
function PayrollPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [employment, setEmployment] = useState<EmploymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [componentsStaff, setComponentsStaff] = useState<StaffMember | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStaff(), fetchEmployment()])
      .then(([s, e]) => {
        setStaff(s.filter((m) => m.active));
        setEmployment(e);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? err.message : "Could not load employment profiles.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const employmentByStaff = new Map(employment.map((e) => [e.staffId, e]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payroll</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {employment.length} of {staff.length} staff have pay set up
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/payroll/runs"
            className="flex min-h-11 items-center rounded border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Payroll runs
          </Link>
          <Link
            href="/payroll/settings"
            className="flex min-h-11 items-center rounded border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Settings
          </Link>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : staff.length === 0 ? (
        <EmptyState title="No active staff yet — add stylists under Staff & skills first." />
      ) : (
        <DataTable
          caption="Staff pay profiles"
          columns={[
            { label: "Staff" },
            { label: "Pay basis" },
            { label: "Rate", align: "right" },
            { label: "Effective from" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {staff.map((s) => {
            const current = employmentByStaff.get(s.id) ?? null;
            return (
              <Row key={s.id} muted={!current}>
                <Cell>
                  <span className="font-medium text-slate-900">{s.name}</span>
                  {s.jobTitle ? <span className="block text-xs text-slate-400">{s.jobTitle}</span> : null}
                </Cell>
                <Cell>
                  {current ? (
                    current.payFrequency === "MONTHLY" ? (
                      "Monthly salary"
                    ) : (
                      "Daily wage"
                    )
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      Not set up
                    </span>
                  )}
                </Cell>
                <Cell align="right">
                  {current ? formatPriceCents(current.baseRateCents) : <span className="text-slate-300">—</span>}
                </Cell>
                <Cell>
                  {current ? formatCalendarDate(current.effectiveFrom) : <span className="text-slate-300">—</span>}
                </Cell>
                <RowActions>
                  <button
                    type="button"
                    onClick={() => setComponentsStaff(s)}
                    className="min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    Allowances & deductions
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingStaff(s)}
                    className={
                      current
                        ? "min-h-11 rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-white"
                        : "min-h-11 rounded border border-teal-600 px-2.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
                    }
                  >
                    {current ? "Change pay" : "Set pay"}
                  </button>
                </RowActions>
              </Row>
            );
          })}
        </DataTable>
      )}

      {!loading && staff.length > 0 ? (
        <p className="text-xs text-slate-400">
          Changing pay never edits history — the current rate stays in force until the date you choose, then the new
          one takes over.
        </p>
      ) : null}

      {editingStaff ? (
        <EmploymentDrawer
          staff={editingStaff}
          current={employmentByStaff.get(editingStaff.id) ?? null}
          onClose={() => setEditingStaff(null)}
          onSaved={() => {
            setEditingStaff(null);
            load();
          }}
        />
      ) : null}

      {componentsStaff ? <PayComponentDrawer staff={componentsStaff} onClose={() => setComponentsStaff(null)} /> : null}
    </div>
  );
}
