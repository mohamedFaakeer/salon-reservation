"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createServicePackage,
  fetchServices,
  type CreateServicePackageInput,
  type ServiceItem,
} from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { errorCopy } from "../lib/error-copy";

const PAYMENT_METHODS: Array<{ value: CreateServicePackageInput["paymentMethod"]; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD_CAPTURED", label: "Card" },
];

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Default expiry: a year out, editable — same reasoning as gift cards' default. */
function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function ServicePackageCreateDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [totalUses, setTotalUses] = useState("5");
  const [purchasePriceRupees, setPurchasePriceRupees] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CreateServicePackageInput["paymentMethod"]>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices().then((res) => {
      const active = res.filter((s) => s.active);
      setServices(active);
      if (active.length > 0) {
        setServiceId(active[0].id);
      }
    });
  }, []);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const usesNumber = Math.round(Number(totalUses));
  const suggestedCents = selectedService && Number.isFinite(usesNumber) ? selectedService.priceCents * usesNumber : 0;

  // The suggested price only overwrites what the operator typed until they
  // edit it themselves — after that, their figure wins even if the service
  // or use count changes.
  useEffect(() => {
    if (!priceTouched && suggestedCents > 0) {
      setPurchasePriceRupees(String(suggestedCents / 100));
    }
  }, [suggestedCents, priceTouched]);

  const purchasePriceCents = Math.round(Number(purchasePriceRupees) * 100);
  const valid =
    serviceId.length > 0 &&
    Number.isFinite(usesNumber) &&
    usesNumber >= 2 &&
    Number.isFinite(purchasePriceCents) &&
    purchasePriceCents > 0 &&
    expiresAt.length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phone.trim().length >= 5;

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createServicePackage(
        {
          serviceId,
          totalUses: usesNumber,
          purchasePriceCents,
          expiresAt,
          customer: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
          },
          paymentMethod,
        },
        generateIdempotencyKey(),
      );
      onCreated();
    } catch (err) {
      const copy = errorCopy(err);
      setError(err instanceof ApiRequestError ? err.message : copy.title);
    } finally {
      setSubmitting(false);
    }
  }

  const discountPercent =
    selectedService && suggestedCents > 0 && purchasePriceCents > 0 && purchasePriceCents < suggestedCents
      ? Math.round((1 - purchasePriceCents / suggestedCents) * 100)
      : 0;

  return (
    <DrawerShell title="Create package" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Service</span>
          <select
            data-testid="service-package-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatPriceCents(s.priceCents)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Total uses</span>
            <input
              data-testid="service-package-uses"
              type="number"
              min={2}
              value={totalUses}
              onChange={(e) => setTotalUses(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Purchase price</span>
            <span className="flex items-center gap-2">
              <span className="text-sm text-slate-500">LKR</span>
              <input
                data-testid="service-package-price"
                type="number"
                min={1}
                value={purchasePriceRupees}
                onChange={(e) => {
                  setPriceTouched(true);
                  setPurchasePriceRupees(e.target.value);
                }}
                className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
              />
            </span>
          </label>
        </div>
        {selectedService && suggestedCents > 0 ? (
          <p className="text-xs text-slate-500">
            Suggested <strong className="font-semibold text-slate-700">{formatPriceCents(suggestedCents)}</strong> for{" "}
            {usesNumber} × {selectedService.name}
            {discountPercent > 0 ? ` — this offers roughly a ${discountPercent}% discount over paying per visit.` : "."}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Expires on</span>
          <input
            data-testid="service-package-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Customer</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              data-testid="service-package-first-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            <input
              data-testid="service-package-last-name"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
          </div>
          <input
            data-testid="service-package-phone"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
          <input
            data-testid="service-package-email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">How was this paid?</legend>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                data-testid={`service-package-payment-${m.value}`}
                onClick={() => setPaymentMethod(m.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${
                  paymentMethod === m.value
                    ? "border-teal-600 bg-teal-50 text-teal-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="service-package-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Creating…">
              Create package
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
