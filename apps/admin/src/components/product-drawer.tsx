"use client";

import { useState } from "react";
import { ApiRequestError, createProduct, updateProduct, type ProductRecord } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { errorCopy } from "../lib/error-copy";

export function ProductDrawer({
  product,
  onClose,
  onSaved,
}: {
  /** Omit to create. */
  product?: ProductRecord;
  onClose: () => void;
  /** `wasCreated` lets the caller hand straight over to the detail drawer to add variants. */
  onSaved: (productId: string, wasCreated: boolean) => void;
}) {
  const editing = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [tracksExpiry, setTracksExpiry] = useState(product?.tracksExpiry ?? false);
  const [trackSerial, setTrackSerial] = useState(product?.trackSerial ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0;

  async function submit(): Promise<void> {
    if (!valid) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || undefined,
        brand: brand.trim() || undefined,
        description: description.trim() || undefined,
        tracksExpiry,
        trackSerial,
        ...(editing ? { active } : {}),
      };
      const saved = product ? await updateProduct(product.id, payload) : await createProduct(payload);
      onSaved(saved.id, !product);
    } catch (err) {
      const copy = errorCopy(err);
      setError(err instanceof ApiRequestError ? err.message : copy.title);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title={editing ? "Edit product" : "Create product"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            data-testid="product-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunsilk Black Shine Shampoo"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Category <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="product-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Hair care"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Brand <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            data-testid="product-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Description <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <textarea
            data-testid="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Notes for the team — not shown to customers"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Tracking</legend>
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
            <input
              type="checkbox"
              data-testid="product-tracks-expiry"
              checked={tracksExpiry}
              onChange={(e) => setTracksExpiry(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">Tracks expiry</span>
              <span className="block text-xs text-slate-500">
                Every stock batch needs an expiry date — for cosmetics and colour.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
            <input
              type="checkbox"
              data-testid="product-track-serial"
              checked={trackSerial}
              onChange={(e) => setTrackSerial(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">Tracks serial numbers</span>
              <span className="block text-xs text-slate-500">
                One serial per unit — for durable resold goods like a hair dryer.
              </span>
            </span>
          </label>
        </fieldset>

        {editing ? (
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
            <input
              type="checkbox"
              data-testid="product-active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">Active</span>
              <span className="block text-xs text-slate-500">
                Turn off to stop it appearing in Quick Sale — sales history is kept either way.
              </span>
            </span>
          </label>
        ) : null}

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
            data-testid="product-submit"
            disabled={!valid || submitting}
            onClick={() => void submit()}
            className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              {editing ? "Save changes" : "Create and add variants"}
            </BusyLabel>
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}
