import { serviceManagementTour } from "./service-management.tour";
import { staffRecordsTour } from "./staff-records.tour";
import { skillsMatrixTour } from "./skills-matrix.tour";
import { weeklyRotaTour } from "./weekly-rota.tour";
import { staffLoginsTour } from "./staff-logins.tour";
import { bookingCreateTour } from "./booking-create.tour";
import { bookingEditTour } from "./booking-edit.tour";
import { bookingStatusLifecycleTour } from "./booking-status-lifecycle.tour";
import { paymentRecordingTour } from "./payment-recording.tour";
import { invoiceManagementTour } from "./invoice-management.tour";
import { bookingCancelTour } from "./booking-cancel.tour";
import { leaveConfigurationTour } from "./leave-configuration.tour";
import { closureConfigurationTour } from "./closure-configuration.tour";
import type { TourDef, TourRole } from "./types";

/**
 * Every tour that exists, in the OWNER onboarding order from the
 * product-tour plan: setup-dependency-ordered (nothing is bookable without a
 * service; nothing is assignable without a stylist qualified and scheduled)
 * before the day-to-day transaction loop. `toursForRoles` filters this same
 * order down per role, so a RECEPTIONIST or MANAGER naturally sees only
 * their relevant slice in the same relative sequence.
 */
export const TOUR_REGISTRY: TourDef[] = [
  serviceManagementTour,
  staffRecordsTour,
  skillsMatrixTour,
  weeklyRotaTour,
  staffLoginsTour,
  bookingCreateTour,
  bookingEditTour,
  bookingStatusLifecycleTour,
  paymentRecordingTour,
  invoiceManagementTour,
  bookingCancelTour,
  leaveConfigurationTour,
  closureConfigurationTour,
];

/** Tours structurally relevant to at least one of the given roles, in catalog order. */
export function toursForRoles(roles: string[]): TourDef[] {
  return TOUR_REGISTRY.filter((tour) => tour.roles.some((r) => roles.includes(r)));
}

export function getTour(id: string): TourDef | undefined {
  return TOUR_REGISTRY.find((tour) => tour.id === id);
}

export type { TourDef, TourRole };
