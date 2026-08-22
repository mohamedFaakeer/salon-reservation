"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, fetchReports, type ReportsSummary } from "../../../lib/api-client";
import { canViewReports } from "../../../lib/permissions";
import { useAuth } from "../../../context/auth-context";
import { errorCopy } from "../../../lib/error-copy";
import { TableSkeleton } from "../../../components/loading-skeleton";
import { defaultRange, RangeBar, type DateRange } from "../../../components/reports/range-bar";
import { TakingsPanel } from "../../../components/reports/takings-panel";
import { StaffPanel } from "../../../components/reports/staff-panel";
import { ServicesPanel } from "../../../components/reports/services-panel";
import { BusyHoursPanel } from "../../../components/reports/busy-hours-panel";
import { CustomersPanel, LapsedPanel } from "../../../components/reports/customers-panel";
import { FunnelPanel } from "../../../components/reports/funnel-panel";
import { formatDateRange } from "../../../lib/format";
import { ModuleGate } from "../../../components/module-gate";

/**
 * Reports — one range, twelve panels, one request.
 *
 * The panels are ordered the way an owner actually asks the questions: how did
 * we do, who did it, what sold, when are we busy, who should we call, and what
 * is leaking. That order is the page's structure; there is no other hierarchy
 * to impose on it.
 *
 * The previous response is held while a new range loads, so changing the dates
 * dims the numbers rather than replacing the whole screen with skeletons. On a
 * surface people compare periods on, blanking the page loses their place.
 */
export default function ReportsPageGated() {
  return (
    <ModuleGate module="reports" label="Reports">
      <ReportsPage />
    </ModuleGate>
  );
}

function ReportsPage() {
  const { user } = useAuth();
  const canView = canViewReports(user?.roles ?? []);

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (range.to < range.from) {
      // The bar already says why; firing a request we know will 400 would
      // replace that with a server error saying the same thing less kindly.
      return;
    }
    setLoading(true);
    setError(null);
    fetchReports(range)
      .then(setReport)
      .catch((err: unknown) => {
        setError(
          err instanceof ApiRequestError ? errorCopy(err).title : "Could not load the reports.",
        );
      })
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(load, [load]);

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Reports are for the salon owner and managers. Your day is on Today.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header />

      <RangeBar range={range} onChange={setRange} busy={loading} />

      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {!report ? (
        loading ? (
          <TableSkeleton rows={8} />
        ) : null
      ) : (
        <div
          className={`transition-opacity duration-200 ${loading ? "opacity-50" : "opacity-100"}`}
          aria-busy={loading}
        >
          <p className="mb-4 text-sm text-slate-500 tabular">
            {formatDateRange(report.range.from, report.range.to)} ·{" "}
            {report.range.days === 1 ? "1 day" : `${report.range.days} days`}
          </p>

          <TakingsPanel data={report.takings} days={report.range.days} />
          <StaffPanel staff={report.staff} />
          <ServicesPanel data={report.services} />
          <BusyHoursPanel cells={report.busyHours} />
          <LapsedPanel rows={report.lapsedCustomers} />
          <CustomersPanel data={report.customerSpend} />
          <FunnelPanel data={report.funnelLosses} />
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        How the salon did, for a period you choose.
      </p>
    </div>
  );
}
