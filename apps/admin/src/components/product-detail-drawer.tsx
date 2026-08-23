"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  createVariant,
  fetchProduct,
  removeProductImage,
  removeVariantImage,
  updateVariant,
  uploadProductImage,
  uploadVariantImage,
  type ProductRecord,
  type ProductVariantRecord,
} from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { DrawerShell } from "./drawer-shell";
import { ImageUploadField } from "./image-upload-field";
import { ProductDrawer } from "./product-drawer";
import { BusyLabel } from "./spinner";
import { LoadingSkeleton } from "./loading-skeleton";
import { useToast } from "./toast";

function Swatch({ imageUrl, size = 40 }: { imageUrl: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white"
      style={{ height: size, width: size }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-300" aria-hidden="true" focusable="false">
          <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
          <path d="m4 18 5-5 3 3 4-5 4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/**
 * A product plus its nested variants — the SKUs actually sold. Editing a
 * product reuses `ProductDrawer` as a second overlay on top of this one
 * (same nesting `GiftCardVoidModal` already does over `GiftCardDetailDrawer`),
 * rather than duplicating its form here.
 */
export function ProductDetailDrawer({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [variants, setVariants] = useState<ProductVariantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchProduct(productId)
      .then((detail) => {
        setProduct(detail.product);
        setVariants(detail.variants);
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load this product."))
      .finally(() => setLoading(false));
  }, [productId]);

  function replaceVariant(updated: ProductVariantRecord): void {
    setVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  }

  if (loading) {
    return (
      <DrawerShell title="Product" onClose={onClose}>
        <LoadingSkeleton rows={4} />
      </DrawerShell>
    );
  }

  if (error || !product) {
    return (
      <DrawerShell title="Product" onClose={onClose}>
        <p role="alert" className="text-sm text-red-600">
          {error ?? "Product not found."}
        </p>
      </DrawerShell>
    );
  }

  const totalStock = variants.reduce((sum, v) => sum + v.quantityOnHand, 0);

  return (
    <>
      <DrawerShell title={product.name} onClose={onClose}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">
                {[product.brand, product.category].filter(Boolean).join(" · ") || "No brand or category set"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {variants.length} {variants.length === 1 ? "variant" : "variants"} ·{" "}
                <span className="tabular">{totalStock}</span> units on hand
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
              >
                {product.active ? "Active" : "Discontinued"}
              </span>
              <button
                type="button"
                data-testid="product-edit-open"
                onClick={() => setEditingProduct(true)}
                className="min-h-8 rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
            </div>
          </div>

          <ImageUploadField
            label="Product photo"
            imageUrl={product.imageUrl}
            disabled={false}
            helpText="PNG, JPEG or WebP · up to 2 MB. A variant can use this photo or one of its own."
            testId="product-image"
            upload={(file) => uploadProductImage(product.id, file)}
            remove={() => removeProductImage(product.id)}
            onChanged={(imageUrl) => setProduct((p) => (p ? { ...p, imageUrl } : p))}
          />

          {product.description ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {product.description}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Tracks expiry</p>
              <p className="mt-0.5 text-sm text-slate-700">{product.tracksExpiry ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Tracks serial</p>
              <p className="mt-0.5 text-sm text-slate-700">{product.trackSerial ? "Yes" : "No"}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Variants</h3>
            {variants.length === 0 ? (
              <p className="rounded border border-slate-200 bg-white px-3 py-4 text-center text-sm text-slate-500">
                No variants yet — add the first one below.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {variants.map((variant) => (
                  <VariantRow key={variant.id} productId={product.id} variant={variant} onChanged={replaceVariant} />
                ))}
              </div>
            )}
          </div>

          <AddVariantForm
            product={product}
            onAdded={(variant) => {
              setVariants((prev) => [...prev, variant]);
              toast.success("Variant added");
            }}
          />
        </div>
      </DrawerShell>

      {editingProduct ? (
        <ProductDrawer
          product={product}
          onClose={() => setEditingProduct(false)}
          onSaved={() => {
            fetchProduct(productId).then((detail) => setProduct(detail.product));
            setEditingProduct(false);
            toast.success("Product updated");
          }}
        />
      ) : null}
    </>
  );
}

function VariantRow({
  productId,
  variant,
  onChanged,
}: {
  productId: string;
  variant: ProductVariantRecord;
  onChanged: (variant: ProductVariantRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sku, setSku] = useState(variant.sku);
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [priceRupees, setPriceRupees] = useState(String(variant.priceCents / 100));
  const [reorderPoint, setReorderPoint] = useState(variant.reorderPoint != null ? String(variant.reorderPoint) : "");
  const [attributes, setAttributes] = useState<Record<string, string>>(variant.attributes ?? {});
  const [active, setActive] = useState(variant.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = Math.round(Number(priceRupees) * 100);
  const valid = sku.trim().length > 0 && Number.isFinite(priceCents) && priceCents >= 0;

  async function save(): Promise<void> {
    if (!valid) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateVariant(productId, variant.id, {
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        attributes,
        priceCents,
        reorderPoint: reorderPoint.trim() ? Number(reorderPoint) : undefined,
        active,
      });
      onChanged(updated);
      setExpanded(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save this variant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        data-testid={`variant-row-${variant.sku}`}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <Swatch imageUrl={variant.imageUrl ?? null} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12px] font-semibold text-slate-900">{variant.sku}</span>
          <span className="block truncate text-[11px] text-slate-400">{variant.barcode ?? "No barcode"}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block tabular text-sm font-semibold text-slate-900">{formatPriceCents(variant.priceCents)}</span>
          <span className="block tabular text-[11px] text-slate-400">{variant.quantityOnHand} on hand</span>
        </span>
        {!variant.active ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Off</span>
        ) : null}
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-3">
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}

          <ImageUploadField
            label="Variant photo"
            imageUrl={variant.imageUrl}
            disabled={false}
            helpText="Optional — falls back to the product's own photo when unset."
            testId={`variant-image-${variant.id}`}
            size={56}
            upload={(file) => uploadVariantImage(productId, variant.id, file)}
            remove={() => removeVariantImage(productId, variant.id)}
            onChanged={(imageUrl) => onChanged({ ...variant, imageUrl })}
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">SKU</span>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">Barcode</span>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">Price (Rs)</span>
              <input
                type="number"
                min={0}
                value={priceRupees}
                onChange={(e) => setPriceRupees(e.target.value)}
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">Reorder point</span>
              <input
                type="number"
                min={0}
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                placeholder="Optional"
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700">
              Attributes <span className="font-normal text-slate-500">(optional)</span>
            </p>
            <div className="mt-2">
              <AttributesEditor initial={variant.attributes ?? {}} onChange={setAttributes} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Sellable in Quick Sale
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="min-h-9 flex-1 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid || saving}
              onClick={() => void save()}
              className="min-h-9 flex-1 rounded bg-teal-600 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <BusyLabel busy={saving} busyText="Saving…">
                Save variant
              </BusyLabel>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddVariantForm({
  product,
  onAdded,
}: {
  product: ProductRecord;
  onAdded: (variant: ProductVariantRecord) => void;
}) {
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [openingCostRupees, setOpeningCostRupees] = useState("");
  const [openingLotCode, setOpeningLotCode] = useState("");
  const [openingExpiresAt, setOpeningExpiresAt] = useState("");
  const [openingSerialNumber, setOpeningSerialNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = Math.round(Number(priceRupees) * 100);
  const valid = sku.trim().length > 0 && Number.isFinite(priceCents) && priceCents >= 0 && priceRupees.trim().length > 0;
  const hasOpeningStock = openingQuantity.trim().length > 0 || openingCostRupees.trim().length > 0;

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const variant = await createVariant(product.id, {
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        priceCents,
        reorderPoint: reorderPoint.trim() ? Number(reorderPoint) : undefined,
        openingQuantity: openingQuantity.trim() ? Number(openingQuantity) : undefined,
        openingUnitCostCents: openingCostRupees.trim() ? Math.round(Number(openingCostRupees) * 100) : undefined,
        openingLotCode: openingLotCode.trim() || undefined,
        openingExpiresAt: openingExpiresAt || undefined,
        openingSerialNumber: openingSerialNumber.trim() || undefined,
      });
      onAdded(variant);
      setSku("");
      setBarcode("");
      setPriceRupees("");
      setReorderPoint("");
      setAttributes({});
      setOpeningQuantity("");
      setOpeningCostRupees("");
      setOpeningLotCode("");
      setOpeningExpiresAt("");
      setOpeningSerialNumber("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't add this variant.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-2 border-t border-slate-200 pt-4">
      <legend className="text-sm font-medium text-slate-700">Add a variant</legend>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">SKU</span>
          <input
            data-testid="variant-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SUN-SHN-900"
            className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">
            Barcode <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="variant-barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">Price (Rs)</span>
          <input
            data-testid="variant-price"
            type="number"
            min={0}
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder="1250"
            className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">
            Reorder point <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="variant-reorder-point"
            type="number"
            min={0}
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
            placeholder="10"
            className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
          />
        </label>
      </div>

      <div className="mt-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-medium text-slate-700">
          Attributes <span className="font-normal text-slate-500">(optional — shown on Quick Sale and receipts)</span>
        </p>
        <div className="mt-2">
          <AttributesEditor initial={attributes} onChange={setAttributes} />
        </div>
      </div>

      <div className="mt-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-medium text-slate-700">
          Opening stock <span className="font-normal text-slate-500">(optional — skip and use Receive stock later)</span>
        </p>
        {product.tracksExpiry || product.trackSerial ? (
          <p className="mt-1 text-[11px] text-slate-500">
            This product tracks {product.tracksExpiry ? "expiry" : "serial numbers"} — every unit needs{" "}
            {product.tracksExpiry ? "an expiry date" : "a serial number"}, same as Receive stock.
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">Quantity on hand</span>
            <input
              data-testid="variant-opening-quantity"
              type="number"
              min={1}
              value={openingQuantity}
              onChange={(e) => setOpeningQuantity(e.target.value)}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">Unit cost (Rs)</span>
            <input
              data-testid="variant-opening-cost"
              type="number"
              min={0}
              value={openingCostRupees}
              onChange={(e) => setOpeningCostRupees(e.target.value)}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
            />
          </label>
        </div>
        {hasOpeningStock && product.trackSerial ? (
          <label className="mt-2 flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">Serial number</span>
            <input
              data-testid="variant-opening-serial"
              value={openingSerialNumber}
              onChange={(e) => setOpeningSerialNumber(e.target.value)}
              placeholder="One unit per batch line"
              className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
            />
          </label>
        ) : hasOpeningStock && product.tracksExpiry ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">
                Lot code <span className="font-normal text-slate-500">(optional)</span>
              </span>
              <input
                value={openingLotCode}
                onChange={(e) => setOpeningLotCode(e.target.value)}
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-slate-700">Expires on</span>
              <input
                data-testid="variant-opening-expiry"
                type="date"
                value={openingExpiresAt}
                onChange={(e) => setOpeningExpiresAt(e.target.value)}
                className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
              />
            </label>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        data-testid="variant-add-submit"
        disabled={!valid || submitting}
        onClick={() => void submit()}
        className="mt-1 min-h-9 self-start rounded border border-teal-600 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-transparent disabled:text-slate-400"
      >
        <BusyLabel busy={submitting} busyText="Adding…">
          + Add variant
        </BusyLabel>
      </button>
    </fieldset>
  );
}

const KNOWN_ATTRIBUTES: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "size", label: "Volume / size", placeholder: "e.g. 400ml" },
  { key: "color", label: "Color" },
  { key: "weight", label: "Weight", placeholder: "e.g. 60g" },
];

interface CustomAttrRow {
  id: string;
  key: string;
  value: string;
}

/**
 * Structured stand-ins for the three attributes a salon actually asks for,
 * plus a repeatable row for anything unusual — the flexible JSON storage on
 * `ProductVariant.attributes` doesn't change, only how it's edited.
 */
function AttributesEditor({
  initial,
  onChange,
}: {
  initial: Record<string, string>;
  onChange: (attributes: Record<string, string>) => void;
}) {
  const [known, setKnown] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const attr of KNOWN_ATTRIBUTES) seed[attr.key] = initial[attr.key] ?? "";
    return seed;
  });
  const [customRows, setCustomRows] = useState<CustomAttrRow[]>(() =>
    Object.entries(initial)
      .filter(([key]) => !KNOWN_ATTRIBUTES.some((attr) => attr.key === key))
      .map(([key, value], i) => ({ id: `existing-${i}`, key, value })),
  );

  function emit(nextKnown: Record<string, string>, nextCustom: CustomAttrRow[]): void {
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(nextKnown)) {
      if (value.trim()) attrs[key] = value.trim();
    }
    for (const row of nextCustom) {
      if (row.key.trim() && row.value.trim()) attrs[row.key.trim()] = row.value.trim();
    }
    onChange(attrs);
  }

  function setKnownField(key: string, value: string): void {
    const next = { ...known, [key]: value };
    setKnown(next);
    emit(next, customRows);
  }

  function setCustomField(id: string, field: "key" | "value", value: string): void {
    const next = customRows.map((row) => (row.id === id ? { ...row, [field]: value } : row));
    setCustomRows(next);
    emit(known, next);
  }

  function removeCustomRow(id: string): void {
    const next = customRows.filter((row) => row.id !== id);
    setCustomRows(next);
    emit(known, next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {KNOWN_ATTRIBUTES.map((attr) => (
          <label key={attr.key} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">{attr.label}</span>
            <input
              data-testid={`variant-attr-${attr.key}`}
              value={known[attr.key] ?? ""}
              onChange={(e) => setKnownField(attr.key, e.target.value)}
              placeholder={attr.placeholder}
              className="min-h-9 rounded border border-slate-300 px-2.5 text-sm"
            />
          </label>
        ))}
      </div>

      {customRows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <input
            value={row.key}
            onChange={(e) => setCustomField(row.id, "key", e.target.value)}
            placeholder="Attribute"
            className="min-h-9 rounded border border-slate-300 px-2 text-xs"
          />
          <input
            value={row.value}
            onChange={(e) => setCustomField(row.id, "value", e.target.value)}
            placeholder="Value"
            className="min-h-9 rounded border border-slate-300 px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => removeCustomRow(row.id)}
            aria-label={`Remove ${row.key || "attribute"}`}
            className="flex h-9 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setCustomRows((prev) => [...prev, { id: `new-${prev.length}-${Date.now()}`, key: "", value: "" }])}
        className="self-start rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
      >
        + Add another attribute
      </button>
    </div>
  );
}
