"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, fetchPayrollRun, fetchTenantMe, type PayrollRunView } from "../../../../../../../lib/api-client";
import { LoadingSkeleton } from "../../../../../../../components/loading-skeleton";
import { PayslipDocument } from "../../../../../../../components/payslip-document";
import { ModuleGate } from "../../../../../../../components/module-gate";

export default function PayslipPageGated() {
  return (
    <ModuleGate module="payroll" label="Payroll">
      <PayslipPage />
    </ModuleGate>
  );
}

/**
 * A payslip is only shown for a run that's been approved — a still-`SUBMITTED`
 * run is a plan awaiting review, not yet a fact worth handing to a stylist
 * as an official record of their pay.
 */
function PayslipPage() {
  const params = useParams<{ id: string; staffId: string }>();
  const [run, setRun] = useState<PayrollRunView | null>(null);
  const [salonName, setSalonName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPayrollRun(params.id), fetchTenantMe()])
      .then(([r, me]) => {
        setRun(r);
        setSalonName(me.tenant.name);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load this payslip."))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <LoadingSkeleton rows={6} />;
  }

  const line = run?.lines.find((l) => l.staffId === params.staffId) ?? null;

  if (error || !run || !line) {
    return (
      <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error ?? "Payslip not found."}
      </p>
    );
  }

  if (run.status !== "APPROVED" && run.status !== "PAID") {
    return (
      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        This payroll hasn&apos;t been approved yet — a payslip isn&apos;t available until it has.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => window.print()}
        className="min-h-11 w-fit rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
      >
        Print or save as PDF
      </button>
      <div className="rounded-lg border border-slate-200 print:border-0">
        <PayslipDocument salonName={salonName} run={run} line={line} />
      </div>
    </div>
  );
}
