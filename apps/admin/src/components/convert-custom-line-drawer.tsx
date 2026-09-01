"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, convertCustomLineToProduct, fetchProducts, type ProductRecord } from "../lib/api-client";
import { formatPriceCents } from "../lib/format";
import { errorCopy } from "../lib/error-copy";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

/**
 * Turns one sold custom (off-catalog) line into a real, searchable,
 * stock-tracked catalog product — a deliberate, later action by whoever
 * holds Manage Inventory, never automatic. Shared by Quick Sale's post-sale
 * shortcut and the Products "Needs review" queue, so the form only exists
 * once. Live-searches existing products so a new size doesn't fragment into
 * a duplicate product — "Body Butter, 50ml" and a newly-sold "Body Butter,
 * 30g" become two variants of one product, not two separate products.
 * Deliberately has no opening-stock field: this adds a catalog entry, not
 * stock — Receive stock stays the existing, separate action for that.
 */
/** Just the fields this form actually needs — satisfied by both `PendingCustomLineView` and a raw `RetailSaleLineView` fresh off a checkout response. */
export interface ConvertibleLine {
  id: string;
  nameSnapshot: string;
  attributeSnapshot: string | null;
  quantity: number;
  unitPriceCentsSnapshot: number;
}

export function ConvertCustomLineDrawer({
  line,
  onClose,
  onConverted,
}: {
  line: ConvertibleLine;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [productName, setProductName] = useState(line.nameSnapshot);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [searchQuery, setSearchQuery] = useState(line.nameSnapshot);
  const [searchResults, setSearchResults] = useState<ProductRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);

  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [attribute, setAttribute] = useState(line.attributeSnapshot ?? "");
  const [priceCents, setPriceCents] = useState(String(line.unitPriceCentsSnapshot / 100));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "existing" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetchProducts({ q: searchQuery.trim(), limit: 8 })
        .then((res) => setSearchResults(res.data))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [mode, searchQuery]);

  const valid =
    sku.trim().length > 0 &&
    Number(priceCents) >= 0 &&
    !Number.isNaN(Number(priceCents)) &&
    (mode === "new" ? productName.trim().length > 0 : selectedProduct !== null);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await convertCustomLineToProduct(line.id, {
        productId: mode === "existing" ? selectedProduct!.id : undefined,
        productName: mode === "new" ? productName.trim() : undefined,
        category: mode === "new" ? category.trim() || undefined : undefined,
        brand: mode === "new" ? brand.trim() || undefined : undefined,
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        attributes: attribute.trim() ? { attribute: attribute.trim() } : undefined,
        priceCents: Math.round(Number(priceCents) * 100),
      });
      onConverted();
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorCopy(err).title : "Couldn't add this to the catalog.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={`Add "${line.nameSnapshot}" to the catalog`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-700">
            Sold {line.quantity}× for {formatPriceCents(line.unitPriceCentsSnapshot)} each
            {line.attributeSnapshot ? ` · ${line.attributeSnapshot}` : ""}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">This is…</legend>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${
                mode === "new" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              A new product
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${
                mode === "existing" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              A new size/variant of an existing product
            </button>
          </div>
        </fieldset>

        {mode === "new" ? (
          <>
            <input
              placeholder="Product name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Category (optional)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              />
              <input
                placeholder="Brand (optional)"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="min-h-11 rounded border border-slate-300 px-3 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            <input
              placeholder="Search existing products…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedProduct(null);
              }}
              className="min-h-11 rounded border border-slate-300 px-3 text-sm"
            />
            {searching ? <p className="text-xs text-slate-500">Searching…</p> : null}
            <div className="flex flex-col gap-1.5">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProduct(p)}
                  className={`rounded-md border px-3 py-2 text-left text-sm ${
                    selectedProduct?.id === p.id ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">{p.name}</span>
                  {p.brand ? <span className="text-slate-500"> · {p.brand}</span> : null}
                </button>
              ))}
              {!searching && searchQuery.trim() && searchResults.length === 0 ? (
                <p className="text-xs text-slate-500">No matching product — switch to &ldquo;A new product&rdquo; instead.</p>
              ) : null}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="ccl-price" className="mb-1 block text-xs font-medium text-slate-600">
              Selling price (Rs.)
            </label>
            <input
              id="ccl-price"
              type="number"
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
              className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm tabular"
            />
          </div>
          <div>
            <label htmlFor="ccl-sku" className="mb-1 block text-xs font-medium text-slate-600">
              SKU
            </label>
            <input
              id="ccl-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. BB-030"
              className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ccl-attr" className="mb-1 block text-xs font-medium text-slate-600">
            Attribute
          </label>
          <input
            id="ccl-attr"
            value={attribute}
            onChange={(e) => setAttribute(e.target.value)}
            placeholder="e.g. 30g, Green"
            className="min-h-11 w-full rounded border border-slate-300 px-3 text-sm"
          />
        </div>
        <input
          placeholder="Barcode (optional)"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="min-h-11 rounded border border-slate-300 px-3 text-sm"
        />

        <p className="text-xs text-slate-500">
          Opening stock isn&rsquo;t set here — this only adds the catalog entry. Receive stock for it the normal way
          once you know how many you actually have.
        </p>

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
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Save to catalog
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
