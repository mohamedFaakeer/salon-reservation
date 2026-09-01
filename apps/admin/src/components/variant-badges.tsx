import { formatCompactDate, todayLocalDate } from "../lib/format";

/** Mirrors `EXPIRY_SOON_DAYS` in `apps/api/src/product/product.service.ts` — kept in sync there, not computed from a shared constant, since it's a plain display threshold, not a business rule this client enforces. */
const EXPIRY_SOON_DAYS = 30;

/**
 * Client-side classification for a single batch's own `expiresAt` — used by
 * the batch list (`BatchList` in `product-detail-drawer.tsx`), which has no
 * per-batch server-computed signal the way a variant's `nearestExpiryDate`
 * does. Plain string comparison is safe: both sides are `YYYY-MM-DD`.
 */
export function classifyExpiryDate(expiresAt: string | null): "expired" | "soon" | "ok" | "none" {
  if (!expiresAt) {
    return "none";
  }
  const today = todayLocalDate();
  if (expiresAt < today) {
    return "expired";
  }
  const days = Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= EXPIRY_SOON_DAYS ? "soon" : "ok";
}

/**
 * A variant's free-form `attributes` (e.g. `{size:"400ml"}`) rendered as
 * small tags — shown as bare values ("400ml") rather than "Key: Value"
 * pairs, since a value like "400ml" or "Green" is self-evident without its
 * key, and a card has little room to spare. Shared by every surface that
 * renders a variant summary (Quick Sale, the product detail drawer, the
 * Stock page, the bundle component picker) so two same-named variants read
 * as different everywhere, not just wherever this was first added.
 */
export function AttributeTags({ attributes, className = "" }: { attributes: Record<string, string>; className?: string }) {
  const values = Object.values(attributes).filter((v) => v.trim());
  if (values.length === 0) {
    return null;
  }
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {values.map((value, i) => (
        <span
          key={i}
          className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
        >
          {value}
        </span>
      ))}
    </span>
  );
}

/** The subset of `VariantWithReorderSignal`'s fields these badges read — never the whole record, so a caller building a minimal fixture doesn't have to fake fields it doesn't have. */
export interface VariantExpirySignal {
  hasExpiredBatch?: boolean;
  expiringSoon?: boolean;
  nearestExpiryDate?: string | null;
}

/**
 * Warning-only, never a block — expiry still only affects which batch gets
 * sold first (see `RetailSaleService`/`allocateFifo`), never whether a sale
 * can happen at all. Red beats amber: a variant that's already expired
 * never simultaneously shows "expires soon".
 */
export function ExpiryBadge({ variant }: { variant: VariantExpirySignal }) {
  if (variant.hasExpiredBatch && variant.nearestExpiryDate) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
        Expired {formatCompactDate(variant.nearestExpiryDate)}
      </span>
    );
  }
  if (variant.expiringSoon && variant.nearestExpiryDate) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
        Expires {formatCompactDate(variant.nearestExpiryDate)}
      </span>
    );
  }
  return null;
}

/** The subset of fields the serial badge reads — see `VariantExpirySignal`'s own note. */
export interface VariantSerialSignal {
  quantityOnHand: number;
  soleSerialNumber?: string | null;
}

/**
 * Shows the actual serial once there's exactly one unit on hand (the common
 * case for a durable good sold one at a time) — otherwise a plain count,
 * since a dense card has no room for a list of serials. The full list
 * always lives one click away in the product detail drawer's batch list.
 */
export function SerialBadge({ variant, trackSerial }: { variant: VariantSerialSignal; trackSerial: boolean }) {
  if (!trackSerial) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700">
      {variant.quantityOnHand === 1 && variant.soleSerialNumber
        ? `Serial ${variant.soleSerialNumber}`
        : `Serial · ${variant.quantityOnHand} in stock`}
    </span>
  );
}
