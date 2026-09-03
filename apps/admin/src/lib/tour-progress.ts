/**
 * Per-user tour completion, tracked client-only (v1 of the product-tour
 * plan). Namespaced by both tenant and user id so a shared front-desk PC
 * with two logins — or two tenants on the same machine — never bleeds one
 * person's progress into another's. Written only at tour end (completed or
 * skipped), never per-step, since there is nothing worth persisting mid-tour.
 *
 * Known, accepted limitation: a new browser/device re-offers completed
 * tours, and clearing site data resets progress. Reasonable for an
 * onboarding aid, not a compliance record — see the product-tour plan for
 * the fast-follow (a `user_tour_progress` table) if cross-device durability
 * is ever wanted.
 */

export type TourProgressStatus = "completed" | "skipped";

function storageKey(tenantId: string | null, userId: string, tourId: string): string {
  return `tour-progress:${tenantId ?? "none"}:${userId}:${tourId}`;
}

export function getTourProgress(
  tenantId: string | null,
  userId: string,
  tourId: string,
): TourProgressStatus | null {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, userId, tourId));
    return raw === "completed" || raw === "skipped" ? raw : null;
  } catch {
    // Private browsing / storage disabled — tours just always show as not started.
    return null;
  }
}

export function setTourProgress(
  tenantId: string | null,
  userId: string,
  tourId: string,
  status: TourProgressStatus,
): void {
  try {
    window.localStorage.setItem(storageKey(tenantId, userId, tourId), status);
  } catch {
    // Nothing to fall back to — a failed write just means progress isn't remembered.
  }
}
