"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import {
  ApiRequestError,
  checkoutRetailSale,
  fetchVariants,
  type PaymentMethod,
  type ProductVariantRecord,
} from "../../../lib/api-client";
import { canRecordPayment, canManageInventory } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { errorCopy } from "../../../lib/error-copy";
import { ModuleGate } from "../../../components/module-gate";
import { DrawerShell } from "../../../components/drawer-shell";
import { BusyLabel } from "../../../components/spinner";
import { useToast } from "../../../components/toast";

interface CartLine {
  variant: ProductVariantRecord;
  quantity: number;
}

interface WalkInCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
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

export default function QuickSalePageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <QuickSalePage />
    </ModuleGate>
  );
}

function QuickSalePage() {
  const { user } = useAuth();
  const canSell = canRecordPayment(user?.roles ?? []) || canManageInventory(user?.roles ?? []);
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductVariantRecord[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [customer, setCustomer] = useState<WalkInCustomer | null>(null);
  const [showAttachCustomer, setShowAttachCustomer] = useState(false);
  const [showCharge, setShowCharge] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoadingResults(true);
      fetchVariants({ q: query || undefined, limit: 60 })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setLoadingResults(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const lines = useMemo(() => Array.from(cart.values()), [cart]);
  const subtotalCents = lines.reduce((sum, l) => sum + l.variant.priceCents * l.quantity, 0);

  function addToCart(variant: ProductVariantRecord): void {
    if (variant.quantityOnHand <= 0) {
      return;
    }
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(variant.id);
      const nextQty = Math.min((existing?.quantity ?? 0) + 1, variant.quantityOnHand);
      next.set(variant.id, { variant, quantity: nextQty });
      return next;
    });
  }

  function changeQty(variantId: string, delta: number): void {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(variantId);
      if (!existing) {
        return prev;
      }
      const qty = Math.min(existing.quantity + delta, existing.variant.quantityOnHand);
      if (qty <= 0) {
        next.delete(variantId);
      } else {
        next.set(variantId, { ...existing, quantity: qty });
      }
      return next;
    });
  }

  async function handleSearchEnter(): Promise<void> {
    const value = query.trim();
    if (!value) {
      return;
    }
    try {
      const res = await fetchVariants({ barcode: value, limit: 1 });
      if (res.data[0]) {
        addToCart(res.data[0]);
        setQuery("");
      }
    } catch {
      // A scan that doesn't resolve to an exact barcode just falls through to the live-filtered list already on screen.
    }
  }

  if (!canSell) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Quick Sale</h1>
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Ringing up a sale needs payment-taking access.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:h-[calc(100vh-88px)] lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="relative">
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="m13.2 13.2-2.9-2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            data-testid="quick-sale-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSearchEnter();
              }
            }}
            placeholder="Scan a barcode, or search by name / SKU…"
            className="min-h-[52px] w-full rounded-[10px] border border-slate-300 pl-11 pr-3 text-[15px]"
          />
        </div>
        <p className="text-[11px] text-slate-400">A USB or Bluetooth barcode scanner types straight into this field.</p>

        {loadingResults && results.length === 0 ? (
          <p className="text-sm text-slate-500">Loading products…</p>
        ) : results.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3 md:grid-cols-4">
            {results.map((variant) => {
              const outOfStock = variant.quantityOnHand <= 0;
              const image = variant.imageUrl ?? variant.product?.imageUrl ?? null;
              return (
                <button
                  key={variant.id}
                  type="button"
                  data-testid={`quick-sale-product-${variant.sku}`}
                  disabled={outOfStock}
                  onClick={() => addToCart(variant)}
                  className="flex min-h-[112px] flex-col items-start justify-between rounded-[10px] border border-slate-200 bg-white p-3.5 text-left hover:border-teal-600 hover:shadow-sm disabled:opacity-55 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    {image ? (
                      <img src={image} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs font-bold text-slate-400">{variant.product?.name?.slice(0, 2).toUpperCase() ?? "—"}</span>
                    )}
                  </span>
                  <span className="mt-2.5 text-[13px] font-semibold leading-tight text-slate-900">
                    {variant.product?.name ?? variant.sku}
                  </span>
                  <span className="text-[11px] text-slate-400">{variant.sku}</span>
                  {outOfStock ? (
                    <span className="mt-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      Out of stock
                    </span>
                  ) : (
                    <span className="mt-2 tabular text-[13px] font-bold text-teal-700">{formatPriceCents(variant.priceCents)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-5 lg:max-h-[calc(100vh-100px)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4.5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Cart</h2>
          <span className="text-xs text-slate-500 tabular">
            {lines.reduce((n, l) => n + l.quantity, 0)} {lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-2">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-5 py-10 text-center text-slate-400">
              <svg width="30" height="30" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M1.5 2h1.6l1.4 8.2a1.4 1.4 0 0 0 1.4 1.2h5.6a1.4 1.4 0 0 0 1.4-1.15l.9-5.05H4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-sm">Cart is empty</span>
              <span className="text-xs">Tap a product to add it</span>
            </div>
          ) : (
            lines.map(({ variant, quantity }) => (
              <div key={variant.id} className="flex items-center gap-2.5 border-b border-slate-100 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{variant.product?.name ?? variant.sku}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {variant.sku} · {formatPriceCents(variant.priceCents)} ea
                  </p>
                </div>
                <span className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-300">
                  <button
                    type="button"
                    aria-label={`Decrease ${variant.sku} quantity`}
                    onClick={() => changeQty(variant.id, -1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    &minus;
                  </button>
                  <span className="w-6 text-center text-[13px] font-semibold tabular">{quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${variant.sku} quantity`}
                    disabled={quantity >= variant.quantityOnHand}
                    onClick={() => changeQty(variant.id, 1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </span>
                <span className="w-[74px] shrink-0 text-right text-[13px] font-bold tabular text-slate-900">
                  {formatPriceCents(variant.priceCents * quantity)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="mx-3.5 mb-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Customer</p>
            <p className="text-[13px] font-semibold text-slate-900">
              {customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Walk-in customer"}
            </p>
          </div>
          <button
            type="button"
            data-testid="quick-sale-attach-customer"
            onClick={() => setShowAttachCustomer(true)}
            className="text-xs font-semibold text-teal-700 hover:underline"
          >
            {customer ? "Change" : "Attach"}
          </button>
        </div>

        <div className="border-t border-slate-200 px-4.5 py-4">
          <div className="mb-1 flex justify-between text-[13px] text-slate-600">
            <span>Subtotal</span>
            <span className="tabular">{formatPriceCents(subtotalCents)}</span>
          </div>
          <div className="my-2 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-slate-700">Total due</span>
            <span className="tabular text-2xl font-bold tracking-tight text-slate-900">{formatPriceCents(subtotalCents)}</span>
          </div>
          <button
            type="button"
            data-testid="quick-sale-charge-open"
            disabled={lines.length === 0}
            onClick={() => setShowCharge(true)}
            className="min-h-[52px] w-full rounded-[10px] bg-teal-600 text-[15px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Charge
          </button>
        </div>
      </aside>

      {showAttachCustomer ? (
        <AttachCustomerDrawer
          initial={customer}
          onClose={() => setShowAttachCustomer(false)}
          onAttached={(c) => {
            setCustomer(c);
            setShowAttachCustomer(false);
          }}
          onClearWalkIn={() => {
            setCustomer(null);
            setShowAttachCustomer(false);
          }}
        />
      ) : null}

      {showCharge ? (
        <ChargeDrawer
          totalCents={subtotalCents}
          customer={customer}
          onClose={() => setShowCharge(false)}
          onCharged={(saleTotalCents) => {
            setCart(new Map());
            setCustomer(null);
            setShowCharge(false);
            toast.success("Sale complete", `${formatPriceCents(saleTotalCents)} charged.`);
          }}
          checkout={(paymentMethod) =>
            checkoutRetailSale(
              {
                lines: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })),
                customer: customer
                  ? {
                      firstName: customer.firstName,
                      lastName: customer.lastName,
                      phone: customer.phone,
                      email: customer.email || undefined,
                    }
                  : undefined,
                paymentMethod,
              },
              generateIdempotencyKey(),
            )
          }
        />
      ) : null}
    </div>
  );
}

function AttachCustomerDrawer({
  initial,
  onClose,
  onAttached,
  onClearWalkIn,
}: {
  initial: WalkInCustomer | null;
  onClose: () => void;
  onAttached: (customer: WalkInCustomer) => void;
  onClearWalkIn: () => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");

  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && phone.trim().length >= 5;

  return (
    <DrawerShell title="Attach a customer" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Optional — a returning customer's phone number matches them to their existing record.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            data-testid="attach-customer-first-name"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
          <input
            data-testid="attach-customer-last-name"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </div>
        <input
          data-testid="attach-customer-phone"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />
        <input
          data-testid="attach-customer-email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClearWalkIn}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keep as walk-in
          </button>
          <button
            type="button"
            data-testid="attach-customer-submit"
            disabled={!valid}
            onClick={() => onAttached({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), email: email.trim() })}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Attach
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

function ChargeDrawer({
  totalCents,
  customer,
  onClose,
  onCharged,
  checkout,
}: {
  totalCents: number;
  customer: WalkInCustomer | null;
  onClose: () => void;
  onCharged: (totalCents: number) => void;
  checkout: (method: PaymentMethod) => Promise<{ totalCents: number }>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const sale = await checkout(method);
      onCharged(sale.totalCents);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorCopy(err).title : "Couldn't complete this sale.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Charge" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Amount due</p>
          <p className="tabular text-[28px] font-bold leading-tight tracking-tight text-slate-900">{formatPriceCents(totalCents)}</p>
          <p className="mt-1 text-sm text-slate-600">
            {customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Walk-in customer"}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">How is this being paid?</legend>
          <div className="flex gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                data-testid={`charge-method-${m.value}`}
                onClick={() => setMethod(m.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${
                  method === m.value ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="charge-confirm"
            disabled={submitting}
            onClick={() => void confirm()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Charging…">
              Confirm payment
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
