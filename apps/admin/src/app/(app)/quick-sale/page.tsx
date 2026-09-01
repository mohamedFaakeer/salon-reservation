"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import {
  ApiRequestError,
  checkoutRetailSale,
  fetchBundles,
  fetchVariants,
  searchCustomers,
  type BundleView,
  type CustomerRecord,
  type PaymentMethod,
  type ProductVariantRecord,
  type RetailSaleView,
} from "../../../lib/api-client";
import { canRecordPayment, canManageInventory } from "../../../lib/permissions";
import { formatPriceCents } from "../../../lib/format";
import { errorCopy } from "../../../lib/error-copy";
import { ModuleGate } from "../../../components/module-gate";
import { DrawerShell } from "../../../components/drawer-shell";
import { BusyLabel, Spinner } from "../../../components/spinner";
import { useToast } from "../../../components/toast";
import { BarcodeScannerModal } from "../../../components/barcode-scanner-modal";
import { ConvertCustomLineDrawer } from "../../../components/convert-custom-line-drawer";

type CartLine =
  | { kind: "variant"; key: string; variant: ProductVariantRecord; quantity: number }
  | { kind: "bundle"; key: string; bundle: BundleView; quantity: number }
  | { kind: "custom"; key: string; name: string; attribute: string; unitPriceCents: number; quantity: number };

/** A custom item has no stock ceiling — there's nothing in the catalog to run out of. */
const CUSTOM_LINE_MAX_QTY = 999;

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
  { value: "QR", label: "QR" },
];

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function variantKey(id: string): string {
  return `v:${id}`;
}
function bundleKey(id: string): string {
  return `b:${id}`;
}
let customLineCounter = 0;
function nextCustomKey(): string {
  customLineCounter += 1;
  return `c:${Date.now()}-${customLineCounter}`;
}

function lineName(line: CartLine): string {
  if (line.kind === "variant") return line.variant.product?.name ?? line.variant.sku;
  if (line.kind === "bundle") return line.bundle.name;
  return line.name;
}
function linePriceCents(line: CartLine): number {
  if (line.kind === "variant") return line.variant.priceCents;
  if (line.kind === "bundle") return line.bundle.priceCents;
  return line.unitPriceCents;
}
function lineMaxQty(line: CartLine): number {
  if (line.kind === "variant") return line.variant.quantityOnHand;
  if (line.kind === "bundle") return line.bundle.availableCount;
  return CUSTOM_LINE_MAX_QTY;
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
  const [variantResults, setVariantResults] = useState<ProductVariantRecord[]>([]);
  const [bundleResults, setBundleResults] = useState<BundleView[]>([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map());
  const [customer, setCustomer] = useState<WalkInCustomer | null>(null);
  const [showAttachCustomer, setShowAttachCustomer] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [completedSale, setCompletedSale] = useState<RetailSaleView | null>(null);
  const [reviewingLine, setReviewingLine] = useState<RetailSaleView["lines"][number] | null>(null);
  const canManageCatalog = canManageInventory(user?.roles ?? []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoadingResults(true);
      Promise.all([
        fetchVariants({ q: query || undefined, limit: 60 }),
        fetchBundles({ q: query || undefined, limit: 30 }),
      ])
        .then(([variants, bundles]) => {
          setVariantResults(variants.data);
          setBundleResults(bundles.data.filter((b) => b.active));
        })
        .catch(() => {
          setVariantResults([]);
          setBundleResults([]);
        })
        .finally(() => setLoadingResults(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const lines = useMemo(() => Array.from(cart.values()), [cart]);
  const subtotalCents = lines.reduce((sum, l) => sum + linePriceCents(l) * l.quantity, 0);

  function addVariantToCart(variant: ProductVariantRecord): void {
    if (variant.quantityOnHand <= 0) {
      return;
    }
    const key = variantKey(variant.id);
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      const nextQty = Math.min((existing?.quantity ?? 0) + 1, variant.quantityOnHand);
      next.set(key, { kind: "variant", key, variant, quantity: nextQty });
      return next;
    });
  }

  function addBundleToCart(bundle: BundleView): void {
    if (bundle.availableCount <= 0) {
      return;
    }
    const key = bundleKey(bundle.id);
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      const nextQty = Math.min((existing?.quantity ?? 0) + 1, bundle.availableCount);
      next.set(key, { kind: "bundle", key, bundle, quantity: nextQty });
      return next;
    });
  }

  function addCustomToCart(input: { name: string; attribute: string; unitPriceCents: number; quantity: number }): void {
    const key = nextCustomKey();
    setCart((prev) => {
      const next = new Map(prev);
      next.set(key, { kind: "custom", key, ...input });
      return next;
    });
  }

  function changeQty(key: string, delta: number): void {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (!existing) {
        return prev;
      }
      const qty = Math.min(existing.quantity + delta, lineMaxQty(existing));
      if (qty <= 0) {
        next.delete(key);
      } else {
        next.set(key, { ...existing, quantity: qty });
      }
      return next;
    });
  }

  /**
   * Shared by a USB/BT scanner-gun's Enter keystroke and the camera scanner
   * — both just produce a barcode string. Returns the matched product's
   * name so a caller can confirm the add without re-deciding what counts
   * as "found".
   */
  async function handleBarcode(value: string): Promise<string | null> {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const res = await fetchVariants({ barcode: trimmed, limit: 1 });
      const variant = res.data[0];
      if (!variant) {
        toast.error("Not found", `No product has the barcode ${trimmed}.`);
        return null;
      }
      addVariantToCart(variant);
      return variant.product?.name ?? variant.sku;
    } catch {
      // A scan that doesn't resolve to an exact barcode just falls through to the live-filtered list already on screen.
      return null;
    }
  }

  async function handleSearchEnter(): Promise<void> {
    if (!query.trim()) {
      return;
    }
    await handleBarcode(query);
    setQuery("");
  }

  async function handleCameraDecoded(code: string): Promise<void> {
    const name = await handleBarcode(code);
    if (name) {
      // A brief confirmation so a rapid multi-scan session has feedback without stealing focus from the camera.
      toast.success("Added", name);
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

  const noResults = variantResults.length === 0 && bundleResults.length === 0;

  return (
    <div className="grid gap-5 lg:h-[calc(100vh-88px)] lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
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
          <button
            type="button"
            data-testid="quick-sale-open-scanner"
            onClick={() => setShowScanner(true)}
            aria-label="Scan a barcode with the camera"
            className="flex min-h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M4 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="quick-sale-open-custom-item"
            onClick={() => setShowCustomItem(true)}
            className="min-h-[52px] shrink-0 whitespace-nowrap rounded-[10px] bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
          >
            + Custom item
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          A USB or Bluetooth scanner types straight into this field, or tap the camera icon. Not in the catalog yet?
          Use Custom item — it sells right away and can be added to the catalog properly afterward.
        </p>

        {loadingResults && noResults ? (
          <p className="text-sm text-slate-500">Loading products…</p>
        ) : noResults ? (
          <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          // md:4 assumes the full viewport width; once `lg:` splits this
          // column against the sidebar + 380px cart, that same column count
          // is cramped until xl/2xl give the space back.
          <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {bundleResults.map((bundle) => {
              const outOfStock = bundle.availableCount <= 0;
              return (
                <button
                  key={bundle.id}
                  type="button"
                  data-testid={`quick-sale-bundle-${bundle.id}`}
                  disabled={outOfStock}
                  onClick={() => addBundleToCart(bundle)}
                  className="relative flex min-h-[112px] flex-col items-start justify-between rounded-[10px] border border-slate-200 bg-white p-3.5 text-left hover:border-teal-600 hover:shadow-sm disabled:opacity-55 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                >
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-700">
                    KIT
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="3" y="3" width="8" height="8" rx="2" />
                      <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity="0.15" />
                    </svg>
                  </span>
                  <span className="mt-2.5 text-[13px] font-semibold leading-tight text-slate-900">{bundle.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {bundle.components.length} item{bundle.components.length === 1 ? "" : "s"}
                    {!outOfStock ? ` · ${bundle.availableCount} set${bundle.availableCount === 1 ? "" : "s"}` : ""}
                  </span>
                  {outOfStock ? (
                    <span className="mt-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      Out of stock
                    </span>
                  ) : (
                    <span className="mt-2 tabular text-[13px] font-bold text-teal-700">{formatPriceCents(bundle.priceCents)}</span>
                  )}
                </button>
              );
            })}
            {variantResults.map((variant) => {
              const outOfStock = variant.quantityOnHand <= 0;
              const image = variant.imageUrl ?? variant.product?.imageUrl ?? null;
              return (
                <button
                  key={variant.id}
                  type="button"
                  data-testid={`quick-sale-product-${variant.sku}`}
                  disabled={outOfStock}
                  onClick={() => addVariantToCart(variant)}
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
            lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2.5 border-b border-slate-100 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">
                    {lineName(line)}
                    {line.kind === "bundle" ? (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold tracking-wide text-amber-700">
                        KIT
                      </span>
                    ) : null}
                    {line.kind === "custom" ? (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold tracking-wide text-amber-700">
                        CUSTOM
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {line.kind === "variant" ? `${line.variant.sku} · ` : ""}
                    {line.kind === "custom" && line.attribute ? `${line.attribute} · ` : ""}
                    {formatPriceCents(linePriceCents(line))} ea
                  </p>
                </div>
                <span className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-300">
                  <button
                    type="button"
                    aria-label={`Decrease ${lineName(line)} quantity`}
                    onClick={() => changeQty(line.key, -1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    &minus;
                  </button>
                  <span className="w-6 text-center text-[13px] font-semibold tabular">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${lineName(line)} quantity`}
                    disabled={line.quantity >= lineMaxQty(line)}
                    onClick={() => changeQty(line.key, 1)}
                    className="flex h-8 w-8 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </span>
                <span className="w-[74px] shrink-0 text-right text-[13px] font-bold tabular text-slate-900">
                  {formatPriceCents(linePriceCents(line) * line.quantity)}
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
          onCharged={(sale) => {
            setCart(new Map());
            setCustomer(null);
            setShowCharge(false);
            toast.success("Sale complete", `${formatPriceCents(sale.totalCents)} charged.`);
            // Only worth surfacing the "add to catalog" shortcut when the
            // person who just checked out can actually act on it — a
            // RECEPTIONIST-only session still rings up custom items fine,
            // it just doesn't see this (they show up in Products → Needs
            // review for an owner/manager instead).
            if (canManageCatalog && sale.lines.some((l) => l.isCustom)) {
              setCompletedSale(sale);
            }
          }}
          checkout={(paymentMethod) =>
            checkoutRetailSale(
              {
                lines: lines.map((l) => {
                  if (l.kind === "variant") return { variantId: l.variant.id, quantity: l.quantity };
                  if (l.kind === "bundle") return { bundleId: l.bundle.id, quantity: l.quantity };
                  return {
                    custom: { name: l.name, attribute: l.attribute || undefined, unitPriceCents: l.unitPriceCents },
                    quantity: l.quantity,
                  };
                }),
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

      {showScanner ? (
        <BarcodeScannerModal onClose={() => setShowScanner(false)} onDecoded={(code) => void handleCameraDecoded(code)} />
      ) : null}

      {showCustomItem ? (
        <CustomItemDrawer
          onClose={() => setShowCustomItem(false)}
          onAdd={(input) => {
            addCustomToCart(input);
            setShowCustomItem(false);
          }}
        />
      ) : null}

      {completedSale ? (
        <DrawerShell title="Sale complete" onClose={() => setCompletedSale(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              {completedSale.lines.filter((l) => l.isCustom).length === 1 ? "1 custom item was" : "Some custom items were"}{" "}
              sold — add it to the catalog now, or find it later in Products → Needs review.
            </p>
            {completedSale.lines
              .filter((l) => l.isCustom)
              .map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {l.nameSnapshot}
                      {l.attributeSnapshot ? ` · ${l.attributeSnapshot}` : ""}
                    </p>
                    <p className="text-xs text-slate-500 tabular">{formatPriceCents(l.unitPriceCentsSnapshot)} each</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewingLine(l)}
                    className="min-h-11 shrink-0 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add to catalog
                  </button>
                </div>
              ))}
            <button
              type="button"
              onClick={() => setCompletedSale(null)}
              className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Not now
            </button>
          </div>
        </DrawerShell>
      ) : null}

      {reviewingLine ? (
        <ConvertCustomLineDrawer
          line={reviewingLine}
          onClose={() => setReviewingLine(null)}
          onConverted={() => {
            setReviewingLine(null);
            setCompletedSale(null);
            toast.success("Added to catalog", `${reviewingLine.nameSnapshot} is now a real product.`);
          }}
        />
      ) : null}
    </div>
  );
}

/** Digits only, so "077 193 2264" and "0771932264" compare equal. */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
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

  const [searching, setSearching] = useState(false);
  const [match, setMatch] = useState<CustomerRecord | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [enteringNew, setEnteringNew] = useState(Boolean(initial));

  // A returning customer's phone number fills in the rest — so the search
  // resets to "nothing found yet" the moment the number changes, and only
  // shows "new customer" once a search has actually come back empty.
  useEffect(() => {
    const digits = normalizePhone(phone);
    setMatch(null);
    if (digits.length < 7) {
      setSearching(false);
      setSearchedFor(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchCustomers(phone.trim())
        .then((results) => {
          const found = results.find((c) => normalizePhone(c.phone) === digits) ?? null;
          setMatch(found);
          setSearchedFor(digits);
        })
        .catch(() => {
          setMatch(null);
          setSearchedFor(digits);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [phone]);

  const showNewCustomerFields = enteringNew || (!searching && !match && searchedFor === normalizePhone(phone) && normalizePhone(phone).length >= 7);
  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && phone.trim().length >= 5;

  function useMatch(customer: CustomerRecord): void {
    onAttached({ firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, email: customer.email ?? "" });
  }

  return (
    <DrawerShell title="Attach a customer" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Start with their phone number — a returning customer's record fills in automatically.
        </p>
        <div>
          <input
            data-testid="attach-customer-phone"
            placeholder="Phone"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setEnteringNew(false);
            }}
            className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm tabular"
          />
          {searching ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Spinner className="h-3.5 w-3.5" />
              Searching…
            </p>
          ) : null}
        </div>

        {match ? (
          <div className="rounded-lg border-[1.5px] border-teal-600 bg-teal-50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-teal-700">Existing customer</p>
            <p className="mt-1.5 text-[15px] font-semibold text-slate-900">
              {match.firstName} {match.lastName}
            </p>
            <p className="mt-0.5 text-sm text-slate-600 tabular">{match.phone}</p>
            <button
              type="button"
              data-testid="attach-customer-use-match"
              onClick={() => useMatch(match)}
              className="mt-3 min-h-11 w-full rounded bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Use this customer
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              Not them?{" "}
              <button
                type="button"
                data-testid="attach-customer-not-them"
                onClick={() => setEnteringNew(true)}
                className="font-semibold text-slate-600 underline hover:text-slate-800"
              >
                Enter as a new customer
              </button>
            </p>
          </div>
        ) : null}

        {showNewCustomerFields ? (
          <>
            {!enteringNew ? (
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                No record found — new customer
              </p>
            ) : null}
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
          </>
        ) : null}

        {!match && !showNewCustomerFields && !searching ? (
          <button
            type="button"
            onClick={onClearWalkIn}
            className="min-h-11 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keep as walk-in
          </button>
        ) : null}
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
  onCharged: (sale: RetailSaleView) => void;
  checkout: (method: PaymentMethod) => Promise<RetailSaleView>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const sale = await checkout(method);
      onCharged(sale);
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

/**
 * Sells an item that isn't in the catalog yet — genuinely off-catalog (no
 * Product/ProductVariant, no stock impact), the same "custom/open item"
 * convention Square/Shopify/Vend use. An OWNER/MANAGER can turn it into a
 * real catalog product afterward (post-sale shortcut here, or Products →
 * Needs review anytime) — never automatic, and never required before it
 * can be sold.
 */
function CustomItemDrawer({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: { name: string; attribute: string; unitPriceCents: number; quantity: number }) => void;
}) {
  const [name, setName] = useState("");
  const [attribute, setAttribute] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const priceCents = Math.round(Number(price) * 100);
  const qty = Math.round(Number(quantity));
  const valid = name.trim().length > 0 && Number(price) > 0 && !Number.isNaN(priceCents) && qty >= 1;

  return (
    <DrawerShell title="Custom item" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">
          Not in the catalog yet — sells right away, no stock or catalog record is created. An owner or manager can
          add it to the catalog properly afterward.
        </p>

        <div>
          <label htmlFor="custom-item-name" className="mb-1 block text-xs font-medium text-slate-600">
            Name
          </label>
          <input
            id="custom-item-name"
            data-testid="custom-item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Body Butter"
            className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="custom-item-attribute" className="mb-1 block text-xs font-medium text-slate-600">
            Attribute <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="custom-item-attribute"
            data-testid="custom-item-attribute"
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            placeholder="e.g. 30g, Green"
            className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="custom-item-price" className="mb-1 block text-xs font-medium text-slate-600">
              Selling price (Rs.)
            </label>
            <input
              id="custom-item-price"
              data-testid="custom-item-price"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm tabular"
            />
          </div>
          <div>
            <label htmlFor="custom-item-qty" className="mb-1 block text-xs font-medium text-slate-600">
              Quantity
            </label>
            <input
              id="custom-item-qty"
              data-testid="custom-item-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm tabular"
            />
          </div>
        </div>

        <button
          type="button"
          data-testid="custom-item-add"
          disabled={!valid}
          onClick={() => onAdd({ name: name.trim(), attribute: attribute.trim(), unitPriceCents: priceCents, quantity: qty })}
          className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Add to cart
        </button>
      </div>
    </DrawerShell>
  );
}
