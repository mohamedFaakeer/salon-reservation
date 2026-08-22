"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import { ApiRequestError, fetchServicePackages, type ServicePackageView } from "../../../lib/api-client";
import { canManageServicePackages } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { ServicePackageCreateDrawer } from "../../../components/service-package-create-drawer";
import { ServicePackageDetailDrawer } from "../../../components/service-package-detail-drawer";
import { ServicePackageVoidModal } from "../../../components/service-package-void-modal";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { useToast } from "../../../components/toast";

const STATUS_STYLE: Record<ServicePackageView["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  DEPLETED: { label: "Used up", className: "bg-slate-100 text-slate-500" },
  VOID: { label: "Void", className: "bg-red-100 text-red-700" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" });
}

export default function ServicePackagesPage() {
  const { user } = useAuth();
  const canManage = canManageServicePackages(user?.roles ?? []);
  const toast = useToast();

  const [packages, setPackages] = useState<ServicePackageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [voiding, setVoiding] = useState<ServicePackageView | null>(null);
  const [viewing, setViewing] = useState<ServicePackageView | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    fetchServicePackages({ q: query || undefined })
      .then(setPackages)
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load service packages."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(""), [load]);

  const usesRemaining = packages.filter((p) => p.status === "ACTIVE").reduce((sum, p) => sum + p.remainingUses, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Service packages</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {packages.length} issued · {usesRemaining} uses remaining across active packages
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            data-testid="service-package-create-open"
            onClick={() => setShowCreate(true)}
            className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
          >
            + Create package
          </button>
        ) : null}
      </div>

      <input
        data-testid="service-package-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            load(q);
          }
        }}
        placeholder="Search by code, customer name or phone…"
        className="min-h-11 max-w-sm rounded border border-slate-300 px-3 text-sm"
      />

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : packages.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No service packages yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.3fr_1.1fr_1fr_1.1fr_0.8fr_0.9fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Code</span>
            <span>Customer</span>
            <span>Service</span>
            <span>Uses</span>
            <span>Price</span>
            <span>Expires</span>
            <span>Status</span>
          </div>
          {packages.map((pkg) => {
            const status = STATUS_STYLE[pkg.status];
            const percentLeft = pkg.totalUses > 0 ? (pkg.remainingUses / pkg.totalUses) * 100 : 0;
            return (
              <div
                key={pkg.id}
                data-testid={`service-package-row-${pkg.code}`}
                role="button"
                tabIndex={0}
                onClick={() => setViewing(pkg)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setViewing(pkg);
                  }
                }}
                className="grid cursor-pointer grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.3fr_1.1fr_1fr_1.1fr_0.8fr_0.9fr_0.8fr] sm:items-center sm:gap-3"
              >
                <span className={`font-mono text-[13px] font-semibold text-slate-900 ${pkg.status === "VOID" ? "text-slate-400 line-through" : ""}`}>
                  {pkg.code}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{pkg.customer?.name ?? "—"}</span>
                  <span className="block truncate text-xs text-slate-400">{pkg.customer?.phone}</span>
                </span>
                <span className="min-w-0 truncate text-slate-700">{pkg.serviceNameSnapshot}</span>
                <span>
                  <span className="tabular-nums font-semibold text-slate-900">{pkg.remainingUses}</span>{" "}
                  <span className="text-xs text-slate-400 tabular-nums">of {pkg.totalUses}</span>
                  {pkg.status !== "VOID" ? (
                    <span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-teal-600" style={{ width: `${percentLeft}%` }} />
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-slate-700">{formatPriceCents(pkg.purchasePriceCents)}</span>
                <span className={`text-xs ${pkg.expired && pkg.status === "ACTIVE" ? "font-medium text-amber-700" : "text-slate-500"}`}>
                  {formatDate(pkg.expiresAt)}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                    {pkg.expired && pkg.status === "ACTIVE" ? "Expired" : status.label}
                  </span>
                  {canManage && pkg.status === "ACTIVE" ? (
                    <button
                      type="button"
                      data-testid={`service-package-void-${pkg.code}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVoiding(pkg);
                      }}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Void
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <ServicePackageCreateDrawer
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            toast.success("Package created");
            load(q);
          }}
        />
      ) : null}

      {voiding ? (
        <ServicePackageVoidModal
          servicePackage={voiding}
          onClose={() => setVoiding(null)}
          onVoided={() => {
            toast.success("Package voided");
            setVoiding(null);
            setViewing(null);
            load(q);
          }}
        />
      ) : null}

      {viewing ? <ServicePackageDetailDrawer servicePackage={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
