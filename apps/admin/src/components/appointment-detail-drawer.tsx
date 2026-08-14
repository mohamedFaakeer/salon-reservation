"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";
import {
  ApiRequestError,
  checkIn,
  complete,
  fetchAppointment,
  fetchPayments,
  fetchTenantSettings,
  inService,
  recordPayment,
  refundPayment,
  type AppointmentDetail,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentType,
} from "../lib/api-client";
import { canActOnOwnAppointment, canIssueRefund, canManageAppointments, canRecordPayment } from "../lib/permissions";
import { formatDurationMin, formatPriceCents, formatTime } from "../lib/format";
import { LoadingSkeleton } from "./loading-skeleton";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD_CAPTURED"];
const PAYMENT_TYPES: PaymentType[] = ["ADVANCE", "FULL", "BALANCE"];

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AppointmentDetailDrawer({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState<PaymentMethod>("CASH");
  const [recordType, setRecordType] = useState<PaymentType>("ADVANCE");
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordSubmitting, setRecordSubmitting] = useState(false);

  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  function load(): void {
    setLoading(true);
    void fetchAppointment(appointmentId)
      .then((a) => {
        setAppointment(a);
        setRecordAmount(String(a.balanceCents / 100));
      })
      .finally(() => setLoading(false));
    void fetchPayments(appointmentId).then((res) => setPayments(res.data));
  }

  useEffect(() => {
    load();
    void fetchTenantSettings().then((s) => setGraceMinutes(s.noShowGraceMinutes ?? 0));
  }, [appointmentId]);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setActing(true);
    setActionError(null);
    try {
      await action();
      load();
      onChanged();
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : "Could not update this appointment.");
    } finally {
      setActing(false);
    }
  }

  async function submitRecordPayment(): Promise<void> {
    if (!appointment) {
      return;
    }
    const amountCents = Math.round(Number(recordAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setRecordError("Enter a valid amount.");
      return;
    }
    setRecordSubmitting(true);
    setRecordError(null);
    try {
      await recordPayment(
        appointment.id,
        { amountCents, method: recordMethod, type: recordType },
        generateIdempotencyKey(),
      );
      setShowRecordForm(false);
      load();
      onChanged();
    } catch (err) {
      setRecordError(err instanceof ApiRequestError ? err.message : "Could not record this payment.");
    } finally {
      setRecordSubmitting(false);
    }
  }

  async function submitRefund(paymentId: string): Promise<void> {
    const amountCents = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setRefundError("Enter a valid amount.");
      return;
    }
    if (!refundReason.trim()) {
      setRefundError("A reason is required.");
      return;
    }
    setRefundSubmitting(true);
    setRefundError(null);
    try {
      await refundPayment(paymentId, { amountCents, reason: refundReason.trim() });
      setRefundingId(null);
      setRefundAmount("");
      setRefundReason("");
      load();
      onChanged();
    } catch (err) {
      setRefundError(err instanceof ApiRequestError ? err.message : "Could not record this refund.");
    } finally {
      setRefundSubmitting(false);
    }
  }

  const roles = user?.roles ?? [];
  const isLate = Boolean(appointment?.checkedInAt) && (appointment?.lateMinutes ?? 0) > graceMinutes;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Appointment</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {loading || !appointment ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {appointment.customer.firstName} {appointment.customer.lastName}
              </p>
              <p className="text-slate-500">{appointment.customer.phone}</p>
            </div>

            {isLate ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm font-medium text-amber-800">
                LATE — {appointment.lateMinutes} minutes
              </div>
            ) : null}

            <div className="text-sm">
              <p className="text-slate-500">
                {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)} with{" "}
                {appointment.staff.name}
              </p>
              <p data-testid="detail-status" className="mt-1 font-semibold text-slate-900">
                {appointment.status}
              </p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Services</p>
              <ul className="text-sm text-slate-600">
                {appointment.lines.map((line) => (
                  <li key={line.id}>
                    {line.nameSnapshot} ({formatDurationMin(line.durationMinSnapshot)}) —{" "}
                    {formatPriceCents(line.priceCentsSnapshot)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-semibold text-slate-900">{formatPriceCents(appointment.totalCents)}</p>
            </div>

            <div className="rounded border border-slate-200 p-3 text-sm">
              <p className="mb-1 text-sm font-medium text-slate-700">Payments</p>
              <p className="text-slate-600">
                Advance required: {formatPriceCents(appointment.advanceRequiredCents)} · Paid:{" "}
                {formatPriceCents(appointment.advancePaidCents)}
              </p>
              <p data-testid="detail-balance" className="font-semibold text-slate-900">
                Balance due: {formatPriceCents(appointment.balanceCents)}
              </p>

              {payments.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {formatPriceCents(p.amountCents)} · {p.method} · {p.type} · {p.state}
                      </span>
                      {canIssueRefund(roles) && (p.state === "SUCCESS" || p.state === "PARTIALLY_REFUNDED") ? (
                        <button
                          type="button"
                          data-testid={`action-refund-${p.id}`}
                          onClick={() => {
                            setRefundingId(p.id);
                            setRefundAmount(String(p.amountCents / 100));
                            setRefundError(null);
                          }}
                          className="text-teal-700 underline hover:text-teal-800"
                        >
                          Refund
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {refundingId ? (
                <div className="mt-2 flex flex-col gap-2 rounded border border-slate-200 p-2">
                  <label className="text-xs text-slate-500">
                    Amount (Rs.)
                    <input
                      type="number"
                      data-testid="refund-amount"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Reason
                    <input
                      type="text"
                      data-testid="refund-reason"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  {refundError ? <p className="text-xs text-red-600">{refundError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundingId(null)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="submit-refund"
                      disabled={refundSubmitting}
                      onClick={() => void submitRefund(refundingId)}
                      className="flex-1 rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      {refundSubmitting ? "Refunding…" : "Confirm refund"}
                    </button>
                  </div>
                </div>
              ) : null}

              {canRecordPayment(roles) && appointment.balanceCents > 0 ? (
                showRecordForm ? (
                  <div className="mt-2 flex flex-col gap-2 rounded border border-slate-200 p-2">
                    <label className="text-xs text-slate-500">
                      Amount (Rs.)
                      <input
                        type="number"
                        data-testid="record-payment-amount"
                        value={recordAmount}
                        onChange={(e) => setRecordAmount(e.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      Method
                      <select
                        data-testid="record-payment-method"
                        value={recordMethod}
                        onChange={(e) => setRecordMethod(e.target.value as PaymentMethod)}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">
                      Type
                      <select
                        data-testid="record-payment-type"
                        value={recordType}
                        onChange={(e) => setRecordType(e.target.value as PaymentType)}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        {PAYMENT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    {recordError ? <p className="text-xs text-red-600">{recordError}</p> : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRecordForm(false)}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="submit-record-payment"
                        disabled={recordSubmitting}
                        onClick={() => void submitRecordPayment()}
                        className="flex-1 rounded bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                      >
                        {recordSubmitting ? "Recording…" : "Record"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="show-record-payment"
                    onClick={() => setShowRecordForm(true)}
                    className="mt-2 rounded border border-teal-600 px-3 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                  >
                    Record payment
                  </button>
                )
              ) : null}
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Timeline</p>
              <ul className="text-xs text-slate-500">
                <li>Created</li>
                {appointment.checkedInAt ? <li>Checked in — {formatTime(appointment.checkedInAt)}</li> : null}
                {appointment.inServiceAt ? <li>In service — {formatTime(appointment.inServiceAt)}</li> : null}
                {appointment.completedAt ? <li>Completed — {formatTime(appointment.completedAt)}</li> : null}
              </ul>
            </div>

            {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

            <div className="flex flex-col gap-2">
              {appointment.status === "CONFIRMED" && canManageAppointments(roles) ? (
                <button
                  type="button"
                  data-testid="action-check-in"
                  disabled={acting}
                  onClick={() => void runAction(() => checkIn(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Check in
                </button>
              ) : null}
              {appointment.status === "CHECKED_IN" &&
              (canManageAppointments(roles) || canActOnOwnAppointment(roles)) ? (
                <button
                  type="button"
                  data-testid="action-in-service"
                  disabled={acting}
                  onClick={() => void runAction(() => inService(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Start service
                </button>
              ) : null}
              {(appointment.status === "CHECKED_IN" || appointment.status === "IN_SERVICE") &&
              (canManageAppointments(roles) || canActOnOwnAppointment(roles)) ? (
                <button
                  type="button"
                  data-testid="action-complete"
                  disabled={acting}
                  onClick={() => void runAction(() => complete(appointment.id))}
                  className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  Complete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
