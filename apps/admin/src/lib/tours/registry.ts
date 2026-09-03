import { bookingCreateTour } from "./booking-create.tour";
import type { TourDef, TourRole } from "./types";

/**
 * Every tour that exists. Grows by one entry per pilot-approved tour — see
 * `docs/DECISIONS.md` and the product-tour plan for the full 15-tour catalog
 * and per-role ordering this will eventually cover.
 */
export const TOUR_REGISTRY: TourDef[] = [bookingCreateTour];

/** Tours structurally relevant to at least one of the given roles, in catalog order. */
export function toursForRoles(roles: string[]): TourDef[] {
  return TOUR_REGISTRY.filter((tour) => tour.roles.some((r) => roles.includes(r)));
}

export function getTour(id: string): TourDef | undefined {
  return TOUR_REGISTRY.find((tour) => tour.id === id);
}

export type { TourDef, TourRole };
