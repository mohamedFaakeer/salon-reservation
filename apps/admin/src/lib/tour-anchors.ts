/**
 * Single source of truth for `data-tour-id` values.
 *
 * Deliberately separate from `data-testid`: those exist for Playwright and
 * are free to be renamed for testing reasons; these exist for the tour
 * engine and are free to be renamed for product-copy reasons. Importing this
 * object from both the component (`data-tour-id={TOUR_ANCHORS.x.y}`) and the
 * tour step definition that targets it means a typo in either place is a
 * compile error, not a step that silently points at nothing in production.
 *
 * Named by UI concept, not by tour — several tours can and do point at the
 * same element (e.g. the booking drawer's submit button matters to the
 * `bookingCreate` tour today and will matter to others later).
 */
export const TOUR_ANCHORS = {
  today: {
    newBookingButton: "today.new-booking-button",
  },
  bookingDrawer: {
    modeSwitch: "booking-drawer.mode-switch",
    customerField: "booking-drawer.customer-field",
    servicesField: "booking-drawer.services-field",
    staffSelect: "booking-drawer.staff-select",
    dateField: "booking-drawer.date-field",
    timeSlots: "booking-drawer.time-slots",
    submitButton: "booking-drawer.submit-button",
  },
} as const;
