"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  fetchPaymentsList,
  type PaymentRecord,
  type ServicePackageView,
} from "../lib/api-client";
import { formatDate, formatPriceCents, formatTime } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { LoadingSkeleton } from "./loading-skeleton";

const STATUS_STYLE: Record<ServicePackageView["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  DEPLETED: { label: "Used up", className: "bg-slate-100 text-slate-500" },
  VOID: { label: "Void", className: "bg-red-100 text-red-700" },
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  );
}

/**
 * Same facts-plus-history shape as `GiftCardDetailDrawer` — every `Payment`
 * row `packageRedemptionId` points at, pre-filtered server-side
 * (`GET /payments?packageRedemptionId=`).
 */
export function ServicePackageDetailDrawer({
  servicePackage,
  onClose,
}: {
  servicePackage: ServicePackageView;
  onClose: () => void;
}) {
  const [redemptions, setRedemptions] = useState<PaymentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentsList({ packageRedemptionId: servicePackage.id, limit: 100 })
      .then((res) => setRedemptions(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load redemption history."));
  }, [servicePackage.id]);

  const status = STATUS_STYLE[servicePackage.status];
  const percentLeft = servicePackage.totalUses > 0 ? (servicePackage.remainingUses / servicePackage.totalUses) * 100 : 0;

  return (
    <DrawerShell title="Package" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[15px] font-semibold text-slate-900">{servicePackage.code}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Issued {formatDate(servicePackage.issuedAt)} {servicePackage.issuedByName ? `by ${servicePackage.issuedByName}` : ""}
            </p>
          </div>
          <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
            {servicePackage.expired && servicePackage.status === "ACTIVE" ? "Expired" : status.label}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold tabular-nums text-slate-900">
              {servicePackage.remainingUses} {servicePackage.remainingUses === 1 ? "use" : "uses"}
            </span>
            <span className="text-xs tabular-nums text-slate-500">of {servicePackage.totalUses}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <span className="block h-full rounded-full bg-teal-600" style={{ width: `${percentLeft}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {servicePackage.serviceNameSnapshot} · {formatPriceCents(servicePackage.unitPriceCentsSnapshot)} credited per use ·
            expires {formatDate(servicePackage.expiresAt)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Fact label="Customer" value={servicePackage.customer?.name ?? "—"} />
          <Fact label="Phone" value={servicePackage.customer?.phone ?? "—"} />
          <Fact label="Purchase price" value={formatPriceCents(servicePackage.purchasePriceCents)} />
        </div>

        {servicePackage.status === "VOID" && servicePackage.voidReason ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Voided {servicePackage.voidedAt ? formatDate(servicePackage.voidedAt) : ""}</p>
            <p className="mt-0.5">{servicePackage.voidReason}</p>
          </div>
        ) : null}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Redemption history</h3>
          <div className="mt-2">
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : redemptions === null ? (
              <LoadingSkeleton rows={2} />
            ) : redemptions.length === 0 ? (
              <p className="rounded border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
                Never redeemed yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {redemptions.map((payment) => (
                  <div
                    key={payment.id}
                    data-testid={`service-package-redemption-${payment.id}`}
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-slate-800 tabular-nums">
                        {formatDate(payment.recordedAt ?? payment.createdAt)}{" "}
                        <span className="text-xs text-slate-400">
                          {formatTime(payment.recordedAt ?? payment.createdAt)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {payment.appointment ? (
                          <span className="tabular-nums">{payment.appointment.bookingReference}</span>
                        ) : (
                          "No booking on record"
                        )}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatPriceCents(payment.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}
