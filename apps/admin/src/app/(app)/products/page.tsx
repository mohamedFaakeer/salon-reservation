"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/auth-context";
import { ApiRequestError, fetchProducts, type ProductRecord } from "../../../lib/api-client";
import { canManageInventory } from "../../../lib/permissions";
import { ModuleGate } from "../../../components/module-gate";
import { ProductDrawer } from "../../../components/product-drawer";
import { ProductDetailDrawer } from "../../../components/product-detail-drawer";
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
  const toast = useToast();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback((query: string) => {
    setLoading(true);
    setError(null);
    fetchProducts({ q: query || undefined, limit: 100 })
      .then((res) => setProducts(res.data))
      .catch((err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Could not load products."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(""), [load]);

  if (!canManage) {
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
        <button
          type="button"
          data-testid="product-create-open"
          onClick={() => setShowCreate(true)}
          className="min-h-11 rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Create product
        </button>
      </div>

      <input
        data-testid="product-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            load(q);
          }
        }}
        placeholder="Search by name or brand…"
        className="min-h-11 max-w-sm rounded border border-slate-300 px-3 text-sm"
      />

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
          <div className="hidden grid-cols-[1.6fr_0.9fr_1fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Name</span>
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
              className="grid cursor-pointer grid-cols-1 gap-2 border-b border-slate-100 px-4 py-3 text-sm outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 sm:grid-cols-[1.6fr_0.9fr_1fr_0.8fr] sm:items-center sm:gap-3"
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

      {showCreate ? (
        <ProductDrawer
          onClose={() => setShowCreate(false)}
          onSaved={(productId) => {
            setShowCreate(false);
            toast.success("Product created");
            load(q);
            setViewingId(productId);
          }}
        />
      ) : null}

      {viewingId ? (
        <ProductDetailDrawer
          productId={viewingId}
          onClose={() => {
            setViewingId(null);
            load(q);
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
