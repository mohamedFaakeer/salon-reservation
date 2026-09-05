import { TOUR_ANCHORS } from "../tour-anchors";
import type { TourDef } from "./types";

/**
 * Pilot tour, per the product-tour plan: step 1 in every applicable role's
 * onboarding sequence, and the tour chosen to prove the hardest technical
 * case first — anchoring into content that mounts asynchronously inside the
 * booking drawer, right after a real click on the page behind it.
 */
export const bookingCreateTour: TourDef = {
  id: "bookingCreate",
  title: "Create a booking",
  description: "Walk-in, phone or online — one form for all of it.",
  roles: ["OWNER", "MANAGER", "RECEPTIONIST"],
  shell: "app",
  completionTitle: "Tour complete",
  completionMessage: "You've walked through creating a booking — every booking source in the app, real or practiced, goes through this same form.",
  steps: [
    {
      anchor: TOUR_ANCHORS.today.newBookingButton,
      title: "Start a new booking",
      body: "Click New booking whenever a customer calls, walks in, or books by phone. This opens the same booking form used everywhere else in the app.",
      route: "/today",
      advanceOn: "element-event",
      eventType: "click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.modeSwitch,
      title: "Booking or inquiry?",
      body: "Leave Booking selected when you're reserving a real slot. Inquiry is for a question with nothing to book yet — it skips staff, date and time entirely.",
      placement: "bottom",
      waitForAnchorMs: 4000,
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.customerField,
      title: "Find or add the customer",
      body: "Search by name or phone. If they're new, you can add them right from this box — no need to leave the drawer.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.servicesField,
      title: "Add the services",
      body: "Pick one or more services. The running total updates as you go, and it drives which staff and time slots show up next.",
      placement: "bottom",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.staffSelect,
      title: "Pick a stylist, or let the system choose",
      body: "Leave this on Any Available Staff to see every qualified stylist's open times at once, or narrow it down to someone specific.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.dateField,
      title: "Choose the date",
      body: "Defaults to today. Change it to book ahead — the time slots below update to match.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.timeSlots,
      title: "Pick an open time",
      body: "Only real, bookable slots show up here — the same availability engine every booking source in the app relies on.",
      placement: "top",
      advanceOn: "next-click",
    },
    {
      anchor: TOUR_ANCHORS.bookingDrawer.submitButton,
      title: "Book it",
      body: "Once a customer and a time are selected, this confirms the appointment. That's the whole flow — every booking in the app, however it started, ends up here.",
      placement: "top",
      advanceOn: "next-click",
    },
  ],
};
