"use client";

import { useEffect, useState } from "react";
import {
  ApiRequestError,
  addBundleComponent,
  createBundle,
  fetchBundle,
  fetchVariants,
  removeBundleComponent,
  updateBundle,
  updateBundleComponent,
  type BundleComponentView,
  type BundleView,
  type ProductVariantRecord,
} from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";
import { errorCopy } from "../lib/error-copy";
import { formatPriceCents } from "../lib/format";
import { AttributeTags } from "./variant-badges";

/** A component picked before the bundle exists yet — same shape as `BundleComponentView`, minus a real `id`. */
interface DraftComponent {
  variantId: string;
  sku: string;
  productName: string;
  quantityOnHand: number;
  quantityPerBundle: number;
}

export function BundleDrawer({
  bundleId,
  onClose,
  onSaved,
}: {
  /** Omit to create. */
  bundleId?: string;
  onClose: () => void;
  /** Fires once, right after a successful create OR the drawer is closed following an edit — the list always reloads either way. */
  onSaved: () => void;
}) {
  const editing = Boolean(bundleId);

  const [loading, setLoading] = useState(editing);
  const [bundle, setBundle] = useState<BundleView | null>(null);
  const [name, setName] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [draftComponents, setDraftComponents] = useState<DraftComponent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [componentBusyId, setComponentBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!bundleId) {
      return;
    }
    fetchBundle(bundleId)
      .then((b) => {
        setBundle(b);
        setName(b.name);
        setPriceRupees(String(b.priceCents / 100));
      })
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Couldn't load this bundle."))
      .finally(() => setLoading(false));
  }, [bundleId]);

  const priceCents = Math.round(Number(priceRupees) * 100);
  const draftAvailable =
    draftComponents.length === 0
      ? 0
      : Math.min(...draftComponents.map((c) => Math.floor(c.quantityOnHand / c.quantityPerBundle)));

  const validIdentity = name.trim().length > 0 && Number.isFinite(priceCents) && priceCents >= 0;
  const canCreate = validIdentity && draftComponents.length > 0;

  async function submitCreate(): Promise<void> {
    if (!canCreate) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createBundle({
        name: name.trim(),
        priceCents,
        components: draftComponents.map((c) => ({ variantId: c.variantId, quantityPerBundle: c.quantityPerBundle })),
      });
      onSaved();
    } catch (err) {
      const copy = errorCopy(err);
      setError(err instanceof ApiRequestError ? err.message : copy.title);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveIdentity(): Promise<void> {
    if (!bundle || !validIdentity) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateBundle(bundle.id, { name: name.trim(), priceCents });
      setBundle(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save these changes.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(): Promise<void> {
    if (!bundle) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateBundle(bundle.id, { active: !bundle.active });
      setBundle(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update this bundle's status.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeComponentQty(component: BundleComponentView, quantityPerBundle: number): Promise<void> {
    if (!bundle || quantityPerBundle < 1) {
      return;
    }
    setComponentBusyId(component.id);
    setError(null);
    try {
      const updated = await updateBundleComponent(bundle.id, component.id, quantityPerBundle);
      setBundle(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update that component.");
    } finally {
      setComponentBusyId(null);
    }
  }

  async function removeComponent(component: BundleComponentView): Promise<void> {
    if (!bundle) {
      return;
    }
    setComponentBusyId(component.id);
    setError(null);
    try {
      const updated = await removeBundleComponent(bundle.id, component.id);
      setBundle(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't remove that component.");
    } finally {
      setComponentBusyId(null);
    }
  }

  async function addExistingComponent(variant: ProductVariantRecord): Promise<void> {
    if (!bundle) {
      return;
    }
    setError(null);
    try {
      const updated = await addBundleComponent(bundle.id, { variantId: variant.id, quantityPerBundle: 1 });
      setBundle(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't add that component.");
    }
  }

  function addDraftComponent(variant: ProductVariantRecord): void {
    setDraftComponents((prev) => {
      if (prev.some((c) => c.variantId === variant.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product?.name ?? variant.sku,
          quantityOnHand: variant.quantityOnHand,
          quantityPerBundle: 1,
        },
      ];
    });
  }

  const pickedVariantIds = editing
    ? (bundle?.components.map((c) => c.variantId) ?? [])
    : draftComponents.map((c) => c.variantId);

  if (loading) {
    return (
      <DrawerShell title="Bundle" onClose={onClose}>
        <p className="text-sm text-slate-500">Loading…</p>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell title={editing ? (bundle?.name ?? "Bundle") : "Create bundle"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {editing && bundle ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">Available to sell</p>
            <p className="tabular text-2xl font-bold text-slate-900">
              {bundle.availableCount} {bundle.availableCount === 1 ? "set" : "sets"}
            </p>
            {bundle.components.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">{bottleneckSentence(bundle.components)}</p>
            ) : null}
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            data-testid="bundle-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunsilk Shampoo + Conditioner Duo"
            className="min-h-11 rounded border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Bundle price</span>
          <span className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Rs.</span>
            <input
              data-testid="bundle-price"
              type="number"
              min={0}
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              className="min-h-11 w-32 rounded border border-slate-300 px-3 text-sm"
            />
          </span>
          <span className="text-xs text-slate-500">The kit's own price — worth vs. the sum of its parts is your call.</span>
        </label>

        {editing ? (
          <button
            type="button"
            data-testid="bundle-save-identity"
            disabled={!validIdentity || submitting}
            onClick={() => void saveIdentity()}
            className="min-h-9 self-start rounded border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BusyLabel busy={submitting} busyText="Saving…">
              Save name / price
            </BusyLabel>
          </button>
        ) : null}

        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm font-medium text-slate-700">
            Components
            {!editing && draftComponents.length > 0 ? (
              <span className="ml-1.5 font-normal text-slate-400">— {draftComponents.length} picked</span>
            ) : null}
          </p>

          <div className="mt-2 flex flex-col gap-2">
            {editing
              ? (bundle?.components ?? []).map((c) => (
                  <ComponentRow
                    key={c.id}
                    name={c.productName}
                    sku={c.sku}
                    quantityOnHand={c.quantityOnHand}
                    quantityPerBundle={c.quantityPerBundle}
                    busy={componentBusyId === c.id}
                    onQuantityChange={(qty) => void changeComponentQty(c, qty)}
                    onRemove={() => void removeComponent(c)}
                  />
                ))
              : draftComponents.map((c) => (
                  <ComponentRow
                    key={c.variantId}
                    name={c.productName}
                    sku={c.sku}
                    quantityOnHand={c.quantityOnHand}
                    quantityPerBundle={c.quantityPerBundle}
                    busy={false}
                    onQuantityChange={(qty) =>
                      setDraftComponents((prev) => prev.map((d) => (d.variantId === c.variantId ? { ...d, quantityPerBundle: qty } : d)))
                    }
                    onRemove={() => setDraftComponents((prev) => prev.filter((d) => d.variantId !== c.variantId))}
                  />
                ))}
          </div>

          {!editing && draftComponents.length > 0 ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Available to sell</span>
                <span className="tabular text-base font-bold text-slate-900">
                  {draftAvailable} {draftAvailable === 1 ? "set" : "sets"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Computed from on-hand right now — never stored.</p>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Add a component</p>
            <ComponentPicker
              excludeVariantIds={pickedVariantIds}
              onPick={editing ? (v) => void addExistingComponent(v) : addDraftComponent}
            />
          </div>
        </div>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={editing ? onSaved : onClose}
            className="min-h-11 flex-1 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {editing ? "Done" : "Cancel"}
          </button>
          {editing && bundle ? (
            <button
              type="button"
              data-testid="bundle-toggle-active"
              disabled={submitting}
              onClick={() => void toggleActive()}
              className="min-h-11 flex-1 rounded border border-red-200 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bundle.active ? "Disable bundle" : "Enable bundle"}
            </button>
          ) : (
            <button
              type="button"
              data-testid="bundle-submit"
              disabled={!canCreate || submitting}
              onClick={() => void submitCreate()}
              className="min-h-11 flex-1 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <BusyLabel busy={submitting} busyText="Creating…">
                Create bundle
              </BusyLabel>
            </button>
          )}
        </div>
      </div>
    </DrawerShell>
  );
}

function bottleneckSentence(components: BundleComponentView[]): string {
  const sets = components.map((c) => ({ c, sets: Math.floor(c.quantityOnHand / c.quantityPerBundle) }));
  const min = Math.min(...sets.map((s) => s.sets));
  const worst = sets.find((s) => s.sets === min);
  if (!worst) {
    return "";
  }
  return `Limited by ${worst.c.productName} — only ${worst.c.quantityOnHand} on hand. Restock it to lift this kit.`;
}

function ComponentRow({
  name,
  sku,
  quantityOnHand,
  quantityPerBundle,
  busy,
  onQuantityChange,
  onRemove,
}: {
  name: string;
  sku: string;
  quantityOnHand: number;
  quantityPerBundle: number;
  busy: boolean;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-900">{name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {sku} · {quantityOnHand} on hand → {Math.floor(quantityOnHand / quantityPerBundle)} sets
        </p>
      </div>
      <label className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          min={1}
          value={quantityPerBundle}
          disabled={busy}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 1) {
              onQuantityChange(n);
            }
          }}
          className="min-h-9 w-14 rounded border border-slate-300 px-2 text-center text-sm"
        />
        <span className="text-xs text-slate-500">per kit</span>
      </label>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        disabled={busy}
        onClick={onRemove}
        className="shrink-0 rounded p-1.5 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ComponentPicker({
  excludeVariantIds,
  onPick,
}: {
  excludeVariantIds: string[];
  onPick: (variant: ProductVariantRecord) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductVariantRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      fetchVariants({ q: q.trim(), limit: 8 })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  const visible = results.filter((v) => !excludeVariantIds.includes(v.id));

  return (
    <div className="flex flex-col gap-2">
      <input
        data-testid="bundle-component-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name / SKU / barcode — or scan"
        className="min-h-11 rounded border border-slate-300 px-3 text-sm"
      />
      {loading ? <p className="text-xs text-slate-400">Searching…</p> : null}
      {visible.map((v) => (
        <div key={v.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-slate-900">{v.product?.name ?? v.sku}</p>
            <AttributeTags attributes={v.attributes} className="mt-0.5" />
            <p className="truncate text-[11px] text-slate-500">
              {v.sku} · {formatPriceCents(v.priceCents)} · {v.quantityOnHand} on hand
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onPick(v);
              setQ("");
              setResults([]);
            }}
            className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Add
          </button>
        </div>
      ))}
    </div>
  );
}
