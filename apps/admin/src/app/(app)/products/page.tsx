"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import {
  ApiRequestError,
  fetchPendingCustomLines,
  fetchProducts,
  type PendingCustomLineView,
  type ProductRecord,
} from "../../../lib/api-client";
import { formatPriceCents } from "../../../lib/format";
import { canManageInventory, canViewInventory } from "../../../lib/permissions";
import { ModuleGate } from "../../../components/module-gate";
import { ProductDrawer } from "../../../components/product-drawer";
import { ProductDetailDrawer } from "../../../components/product-detail-drawer";
import { ProductImportDrawer } from "../../../components/product-import-drawer";
import { ConvertCustomLineDrawer } from "../../../components/convert-custom-line-drawer";
import { LoadingSkeleton } from "../../../components/loading-skeleton";
import { useToast } from "../../../components/toast";

export default function ProductsPageGated() {
  return (
    <ModuleGate module="inventory" label="Retail inventory">
      <ProductsPage />
    </ModuleGate>
  );
}

function ProductsPage() {
  const { user } = useAuth();
  const canManage = canManageInventory(user?.roles ?? []);
  const canView = canViewInventory(user?.roles ?? []);
  const toast = useToast();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const [tab, setTab] = useState<"all" | "review">("all");
  const [pendingLines, setPendingLines] = useState<PendingCustomLineView[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [reviewingLine, setReviewingLine] = useState<PendingCustomLineView | null>(null);

  const load = useCallback((query: string, includeInactive: boolean) => {
    setLoading(true);
    setError(null);
    fetchProducts({ q: query || undefined, includeInactive, limit: 100 })
      .then((res) => setProducts(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load products."))
      .finally(() => setLoading(false));
  }, []);

  const loadPending = useCallback(() => {
    setLoadingPending(true);
    fetchPendingCustomLines()
      .then(setPendingLines)
      .catch(() => setPendingLines([]))
      .finally(() => setLoadingPending(false));
  }, []);

  useEffect(() => load("", showInactive), [load, showInactive]);
  // Only OWNER/MANAGER can reach this endpoint at all — no point requesting
  // it (and getting a 403) for a view-only session that can't act on it anyway.
  useEffect(() => {
    if (canManage) loadPending();
  }, [canManage, loadPending]);

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <Header />
        <p className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Products are managed by the salon owner and managers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Header count={products.length} />
        {canManage ? (
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="product-import-open"
              onClick={() => setShowImport(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2v8m0 0 3-3m-3 3-3-3M3 12v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V12"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Import products
            </button>
            <button
              type="button"
              data-testid="product-create-open"
              onClick={() => setShowCreate(true)}
              className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
            >
              + Create product
            </button>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
              tab === "all" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            All products
          </button>
          <button
            type="button"
            data-testid="products-tab-needs-review"
            onClick={() => setTab("review")}
            className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
              tab === "review" ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Needs review
            {pendingLines.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                {pendingLines.length}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {tab === "review" ? (
        <>
          <p className="text-sm text-slate-500">
            Sold as a custom item from Quick Sale and not yet in the catalog. These sold and charged normally —
            nothing here is blocked. Revenue already counts in sales totals; margin reports exclude them until
            completed, since the real cost isn&rsquo;t known yet.
          </p>
          {loadingPending ? (
            <LoadingSkeleton rows={3} />
          ) : pendingLines.length === 0 ? (
            <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Nothing needs review right now.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="hidden grid-cols-[1.6fr_0.8fr_1fr_1fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
                <span>Sold as</span>
                <span>Price</span>
                <span>Sold</span>
                <span>Sold by</span>
                <span />
              </div>
              {pendingLines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1.6fr_0.8fr_1fr_1fr_auto] sm:items-center sm:gap-3"
                >
                  <span className="min-w-0 truncate font-medium text-slate-900">
                    {line.nameSnapshot}
                    {line.attributeSnapshot ? <span className="text-slate-500"> · {line.attributeSnapshot}</span> : null}
                  </span>
                  <span className="tabular text-slate-700">{formatPriceCents(line.unitPriceCentsSnapshot)}</span>
                  <span className="text-slate-600">{new Date(line.createdAt).toLocaleString()}</span>
                  <span className="truncate text-slate-600">{line.soldByName ?? "—"}</span>
                  <button
                    type="button"
                    onClick={() => setReviewingLine(line)}
                    className="min-h-9 shrink-0 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Add to catalog
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          data-testid="product-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              load(q, showInactive);
            }
          }}
          placeholder="Search by name or brand…"
          className="min-h-11 max-w-sm flex-1 rounded border border-slate-300 px-3 text-sm"
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            data-testid="product-show-discontinued"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 accent-teal-600"
          />
          Show discontinued
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : products.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No products yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.6fr_0.8fr_0.9fr_1fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Name</span>
            <span>Variants</span>
            <span>Category</span>
            <span>Brand</span>
            <span>Status</span>
          </div>
          {products.map((product) => (
            <div
              key={product.id}
              data-testid={`product-row-${product.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setViewingId(product.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setViewingId(product.id);
                }
              }}
              className="grid cursor-pointer grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.6fr_0.8fr_0.9fr_1fr_0.8fr] sm:items-center sm:gap-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-300" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                      <path d="m4 18 5-5 3 3 4-5 4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="truncate font-medium text-slate-900">{product.name}</span>
              </span>
              <span className={`tabular ${product.variantCount ? "text-slate-600" : "text-slate-400"}`}>
                {product.variantCount ?? 0} {product.variantCount === 1 ? "variant" : "variants"}
              </span>
              <span className="text-slate-600">{product.category ?? "—"}</span>
              <span className="text-slate-600">{product.brand ?? "—"}</span>
              <span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {product.active ? "Active" : "Discontinued"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {showCreate ? (
        <ProductDrawer
          onClose={() => setShowCreate(false)}
          onSaved={(productId) => {
            setShowCreate(false);
            toast.success("Product created");
            load(q, showInactive);
            setViewingId(productId);
          }}
        />
      ) : null}

      {viewingId ? (
        <ProductDetailDrawer
          productId={viewingId}
          onClose={() => {
            setViewingId(null);
            load(q, showInactive);
          }}
        />
      ) : null}

      {showImport ? (
        <ProductImportDrawer
          onClose={() => setShowImport(false)}
          onImported={() => {
            toast.success("Products imported");
            load(q, showInactive);
          }}
        />
      ) : null}

      {reviewingLine ? (
        <ConvertCustomLineDrawer
          line={reviewingLine}
          onClose={() => setReviewingLine(null)}
          onConverted={() => {
            const name = reviewingLine.nameSnapshot;
            setReviewingLine(null);
            toast.success("Added to catalog", `${name} is now a real product.`);
            loadPending();
            load(q, showInactive);
          }}
        />
      ) : null}
    </div>
  );
}

function Header({ count }: { count?: number }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Products</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        {count !== undefined ? `${count} products` : "What the salon stocks and sells"}
      </p>
    </div>
  );
}
